'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Driver } from 'driver.js';
import { useAuth } from '@/lib/auth-context';
import { toast } from '@/components/Toast';
import {
  activeSteps,
  effectiveRoute,
  getTour,
  tourAllowedForRole,
  tourMatchesRoute,
  type TourDefinition,
  type TourStep,
} from '@/lib/tours';

type StopReason = 'finish' | 'skip' | 'close' | 'dismissed';

interface TourContextValue {
  isActive: boolean;
  tour: TourDefinition | null;
  stepIndex: number;
  stepCount: number;
  doneIds: string[];
  start: (tourId: string, fromIndex?: number) => void;
  stop: (reason?: StopReason) => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue | null {
  return useContext(TourContext);
}

const doneKey = (userId: number) => `kgmis_tour_done_${userId}`;

function readDone(userId: number): string[] {
  try {
    const raw = localStorage.getItem(doneKey(userId));
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeDone(userId: number, ids: string[]) {
  try {
    localStorage.setItem(doneKey(userId), JSON.stringify(ids));
  } catch {
    /* noop */
  }
}

function isMobile(): boolean {
  return typeof window !== 'undefined' && window.innerWidth <= 900;
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function overlayColorFor(): string {
  const dark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
  return dark ? 'rgba(3, 7, 15, 0.78)' : 'rgba(15, 23, 42, 0.55)';
}

/** Resolve a step's target selector for the current viewport. */
function selectorFor(step: TourStep): string | null {
  if (isMobile() && step.mobileSelector !== undefined) return step.mobileSelector;
  return step.selector;
}

/** Poll until the selector resolves (element exists). Returns null on timeout. */
function waitFor(selector: string, timeoutMs: number): Promise<Element | null> {
  return new Promise((resolve) => {
    const found = document.querySelector(selector);
    if (found) {
      resolve(found);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        window.clearInterval(timer);
        resolve(el);
      } else if (Date.now() - started > timeoutMs) {
        window.clearInterval(timer);
        resolve(null);
      }
    }, 100);
  });
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();

  const [activeTour, setActiveTour] = useState<TourDefinition | null>(null);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [doneIds, setDoneIds] = useState<string[]>([]);

  const driverRef = useRef<Driver | null>(null);
  const destroyingRef = useRef(false); // suppress onDestroyed -> stop loops
  const lockRef = useRef(0); // debounces double click dispatch from driver internals
  const tourRef = useRef<TourDefinition | null>(null);
  const stepsRef = useRef<TourStep[]>([]);
  const indexRef = useRef(0);
  const segmentStartRef = useRef(0);
  const startPathRef = useRef('/');
  const pathnameRef = useRef(pathname);
  const roleRef = useRef<string | null>(null);
  const showSeqRef = useRef(0); // cancels stale async showStep chains

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    roleRef.current = user?.role ?? null;
    if (user) setDoneIds(readDone(user.userId));
  }, [user]);

  const finish = useCallback(
    (tour: TourDefinition, stepsList: TourStep[]) => {
      if (user) {
        const next = readDone(user.userId);
        if (!next.includes(tour.id)) {
          const updated = [...next, tour.id];
          writeDone(user.userId, updated);
          setDoneIds(updated);
        }
      }
      tourRef.current = null;
      stepsRef.current = [];
      setActiveTour(null);
      setSteps([]);
      toast.success(`“${tour.title}” completed — replay it any time from Take a Tour.`);
      void stepsList;
    },
    [user]
  );

  const stop = useCallback(
    (reason: StopReason = 'dismissed') => {
      showSeqRef.current += 1;
      const tour = tourRef.current;
      if (driverRef.current) {
        destroyingRef.current = true;
        try {
          driverRef.current.destroy();
        } catch {
          /* noop */
        }
        driverRef.current = null;
        destroyingRef.current = false;
      }
      if (tour && reason === 'finish') {
        finish(tour, stepsRef.current);
      } else {
        tourRef.current = null;
        stepsRef.current = [];
        setActiveTour(null);
        setSteps([]);
      }
    },
    [finish]
  );

  // Driver destroyed externally (Esc / driver internals) -> treat as dismissal.
  const onDestroyed = useCallback(() => {
    if (destroyingRef.current) return;
    driverRef.current = null;
    if (tourRef.current) stop('dismissed');
  }, [stop]);

  const showStep = useCallback(
    async (index: number): Promise<void> => {
      const tour = tourRef.current;
      const stepsList = stepsRef.current;
      if (!tour) return;

      if (index >= stepsList.length) {
        finish(tour, stepsList);
        return;
      }
      if (index < 0) index = 0;

      const seq = ++showSeqRef.current;
      const stale = () => seq !== showSeqRef.current || tourRef.current !== tour;

      // Tear down any live instance before (re)driving.
      if (driverRef.current) {
        destroyingRef.current = true;
        try {
          driverRef.current.destroy();
        } catch {
          /* noop */
        }
        driverRef.current = null;
        destroyingRef.current = false;
      }
      if (stale()) return;

      const step = stepsList[index];
      const selector = selectorFor(step);
      if (!selector) {
        // Step skipped on this viewport.
        await showStep(index + 1);
        return;
      }

      // Navigate if this step's effective route differs from where we are.
      const targetRoute = effectiveRoute(tour, stepsList, index, startPathRef.current);
      if (targetRoute !== pathnameRef.current) {
        router.push(targetRoute);
        const routeStarted = Date.now();
        while (pathnameRef.current !== targetRoute) {
          if (stale()) return;
          if (Date.now() - routeStarted > 6000) break;
          await new Promise((r) => setTimeout(r, 120));
        }
        if (pathnameRef.current !== targetRoute) {
          if (stale()) return;
          await showStep(index + 1);
          return;
        }
      }

      const element = await waitFor(selector, 1400);
      if (stale()) return;
      if (!element) {
        await showStep(index + 1);
        return;
      }

      // Segment = contiguous steps sharing this effective route.
      let segEnd = index;
      while (
        segEnd + 1 < stepsList.length &&
        effectiveRoute(tour, stepsList, segEnd + 1, startPathRef.current) === targetRoute
      ) {
        segEnd += 1;
      }
      segmentStartRef.current = index;
      indexRef.current = index;
      setStepIndex(index);

      // Dynamic import keeps driver.js out of the initial bundle / SSR path.
      const { driver } = await import('driver.js');
      if (stale()) return;

      const driverSteps = stepsList.slice(index, segEnd + 1).map((s, i) => {
        const sel = i === 0 ? null : selectorFor(s);
        const side = s.placement ?? 'bottom';
        // Steps skipped on this viewport get an impossible selector so
        // driver's skipMissingElement drops them without shifting indices.
        return {
          element: i === 0 ? element : sel ?? '.__kgmis_step_skip__',
          skipMissingElement: true,
          waitForElement: 900,
          popover: {
            title: s.title,
            description: s.body,
            side: side === 'center' ? 'bottom' : side,
            popoverClass: 'kgmis-tour-popover',
          },
        };
      });

      const syncIndex = (d: Driver) => {
        const local = d.getActiveIndex() ?? 0;
        indexRef.current = segmentStartRef.current + local;
        setStepIndex(indexRef.current);
      };

      const instance = driver({
        animate: !reducedMotion(),
        overlayColor: overlayColorFor(),
        overlayOpacity: 0.78,
        smoothScroll: true,
        allowClose: true,
        allowScroll: true,
        overlayClickBehavior: 'none',
        advanceOnClick: false,
        disableActiveInteraction: true,
        skipMissingElement: true,
        waitForElement: 900,
        allowKeyboardControl: true,
        // NB: driver 1.9 treats [] as "no restriction" and renders its native
        // next/previous/close anyway (with inline display styles). The native
        // chrome is stripped in renderControls below — only our foot remains.
        showButtons: [],
        showProgress: false,
        steps: driverSteps,
        onPopoverRender: (popover, opts) => {
          renderControls(popover, opts.driver);
        },
        onHighlighted: (_el, _s, opts) => {
          syncIndex(opts.driver);
          const pop = opts.state.popover;
          if (pop) renderControls(pop, opts.driver);
        },
        onDestroyed,
      });
      driverRef.current = instance;
      instance.drive(0);
      if (stale()) {
        destroyingRef.current = true;
        try {
          instance.destroy();
        } catch {
          /* noop */
        }
        destroyingRef.current = false;
      }
    },
    [finish, onDestroyed, router]
  );

  /** Custom popover controls: Skip · progress · Prev · Next/Finish · Close. */
  const renderControls = useCallback((popover: { wrapper: HTMLElement; progress: HTMLElement }, d: Driver) => {
    const tour = tourRef.current;
    if (!tour) return;
    const total = stepsRef.current.length;
    const current = Math.min(indexRef.current + 1, total);
    const last = current >= total;

    popover.progress.textContent = `Step ${current} of ${total}`;
    popover.progress.style.display = 'block';

    // Driver 1.9 rebuilds the popover every step and re-shows its native
    // navigation buttons + close (showButtons: [] = "show all", set inline).
    // Remove them so only the custom foot below is available.
    popover.wrapper
      .querySelectorAll('.driver-popover-navigation-btns, .driver-popover-close-btn')
      .forEach((n) => n.remove());

    popover.wrapper.querySelectorAll('.kgmis-tour-foot').forEach((n) => n.remove());
    const foot = document.createElement('div');
    foot.className = 'kgmis-tour-foot';

    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'kgmis-tour-skip';
    skip.textContent = 'Skip tour';
    skip.addEventListener('click', () => stop('skip'));

    const bar = document.createElement('div');
    bar.className = 'kgmis-tour-bar';
    bar.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('i');
    fill.style.width = `${Math.round((current / Math.max(total, 1)) * 100)}%`;
    bar.appendChild(fill);

    const nav = document.createElement('div');
    nav.className = 'kgmis-tour-nav';

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'btn btn-ghost btn-sm';
    prev.textContent = 'Previous';
    prev.disabled = indexRef.current === 0 && d.isFirstStep();
    prev.addEventListener('click', () => {
      const now = Date.now();
      if (now - lockRef.current < 300) return;
      lockRef.current = now;
      if (!d.isFirstStep()) d.movePrevious();
      else if (indexRef.current > 0) void showStep(indexRef.current - 1);
    });

    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'btn btn-primary btn-sm';
    next.textContent = last ? 'Finish' : 'Next';
    next.addEventListener('click', () => {
      const now = Date.now();
      if (now - lockRef.current < 300) return;
      lockRef.current = now;
      if (last) {
        const tourNow = tourRef.current;
        if (tourNow) finish(tourNow, stepsRef.current);
        else stop('finish');
        return;
      }
      if (!d.isLastStep()) d.moveNext();
      else void showStep(indexRef.current + 1);
    });

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'kgmis-tour-close';
    close.setAttribute('aria-label', 'Close tour');
    close.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
    close.addEventListener('click', () => stop('close'));

    nav.append(prev, next);
    foot.append(skip, bar, nav, close);
    popover.wrapper.appendChild(foot);
  }, [finish, showStep, stop]);

  const start = useCallback(
    async (tourId: string, fromIndex = 0) => {
      const tour = getTour(tourId);
      if (!tour) {
        toast.error('Tour not found.');
        return;
      }
      if (!tourAllowedForRole(tour, roleRef.current)) {
        toast.error('This tour is not available for your role.');
        return;
      }
      if (tourRef.current) stop('dismissed');

      const seq = ++showSeqRef.current;
      const stale = () => seq !== showSeqRef.current;

      // Started from elsewhere (e.g. the /tours catalog): open the tour's own
      // page first so the steps run against real UI instead of being skipped.
      if (!tourMatchesRoute(tour, pathnameRef.current)) {
        if (tour.dynamic) {
          // Record-level tours can only run on an opened record: go to the
          // list page and tell the user how to continue.
          router.push(tour.entry ?? tour.routes[0]);
          toast.info(tour.startHint ?? 'Open a record on that page, then press Take a tour.');
          return;
        }
        const target = tour.entry ?? tour.routes[0];
        router.push(target);
        const routeStarted = Date.now();
        while (pathnameRef.current !== target) {
          if (stale()) return;
          if (Date.now() - routeStarted > 6000) {
            toast.error('Could not open the tour page.');
            return;
          }
          await new Promise((r) => setTimeout(r, 120));
        }
        if (stale()) return;
      }

      const runSteps = activeSteps(tour, roleRef.current, pathnameRef.current);
      if (runSteps.length === 0) {
        toast.info('No tour steps are available for your role on this page.');
        return;
      }
      tourRef.current = tour;
      stepsRef.current = runSteps;
      startPathRef.current = pathnameRef.current;
      setActiveTour(tour);
      setSteps(runSteps);
      void showStep(Math.min(fromIndex, runSteps.length - 1));
    },
    [router, showStep, stop]
  );

  // Teardown if the provider unmounts mid-tour.
  useEffect(
    () => () => {
      if (driverRef.current) {
        destroyingRef.current = true;
        try {
          driverRef.current.destroy();
        } catch {
          /* noop */
        }
      }
    },
    []
  );

  const value = useMemo<TourContextValue>(
    () => ({
      isActive: activeTour !== null,
      tour: activeTour,
      stepIndex,
      stepCount: steps.length,
      doneIds,
      start,
      stop,
    }),
    [activeTour, doneIds, start, stepIndex, steps.length, stop]
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
