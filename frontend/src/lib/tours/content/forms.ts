import type { TourDefinition } from '../types';

export const FORMS_TOUR: TourDefinition = {
  id: 'forms',
  title: 'Forms & surveys',
  subtitle: 'Create forms and collect responses',
  icon: 'clipboard-list',
  section: 'Field intelligence',
  roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'],
  routes: ['/forms'],
  steps: [
    {
      selector: '.page-head',
      title: 'Forms module',
      body: 'Design surveys, publish them to the field and watch responses arrive. Two lists appear here: forms you can respond to, and the full library.',
      placement: 'bottom',
    },
    {
      selector: '.page-head .actions .btn-primary',
      title: 'New form',
      body: 'Creates a blank form and opens the builder. Drafts are private until you press Publish.',
      placement: 'bottom',
    },
    {
      selector: '.filters',
      title: 'Status filter',
      body: 'Switch between All, Draft, Published and Archived forms — managers mostly live in Published.',
      placement: 'bottom',
    },
    {
      selector: '.card-header',
      title: 'Open forms',
      body: 'Forms published to your role appear here with a Fill in button — the quickest way to submit a response from the field.',
      placement: 'bottom',
    },
    {
      selector: '.table-wrap',
      title: 'All forms',
      body: 'Every form with status, response count and owner. Open a row to enter the builder, settings, responses or report tabs.',
      placement: 'top',
    },
    {
      selector: '.pagination',
      title: 'Large libraries',
      body: 'With many forms the list pages automatically — or filter by status to narrow it down.',
      placement: 'top',
    },
  ],
};

export const FORM_BUILDER_TOUR: TourDefinition = {
  id: 'form-builder',
  title: 'Form builder',
  subtitle: 'Design, publish and analyse a form',
  icon: 'pen-ruler',
  section: 'Field intelligence',
  roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst'],
  routes: ['/forms/[id]'],
  entry: '/forms',
  dynamic: true,
  startHint: 'Open any form from the Forms list to take this tour.',
  steps: [
    {
      selector: '.page-head .actions',
      title: 'Lifecycle buttons',
      body: 'Publish makes a draft live; Publish changes pushes edits of a live form; Archive hides it from respondents; Delete removes it permanently.',
      placement: 'bottom',
    },
    {
      selector: '.tabs',
      title: 'Four tabs',
      body: 'Builder designs the form, Settings handles access and limits, Responses shows submissions, Report analyses them — the response badge shows the live count.',
      placement: 'bottom',
    },
    {
      selector: '.btoolbar',
      title: 'Builder toolbar',
      body: 'Undo/redo, panel toggles, zoom, AI Form Assistant, Preview and version controls. The back arrow returns to the Forms list.',
      placement: 'bottom',
    },
    {
      selector: '.blib',
      title: 'Field library',
      body: 'Drag any field type onto the canvas — text, choice, matrix, signature, upload. Use the search box to find a field type quickly.',
      placement: 'right',
    },
    {
      selector: '.bcv-workspace',
      title: 'The canvas',
      body: 'Fields are arranged visually exactly as respondents will see them. Click a field to select it — the properties panel opens on the right.',
      placement: 'top',
    },
    {
      selector: '.bp',
      title: 'Properties panel',
      body: 'Edit the selected field’s label, required rule, options, validation and branching logic here.',
      placement: 'left',
    },
    {
      selector: '.btoolbar-save',
      title: 'Save versions',
      body: 'Autosave keeps a draft running; Save version creates a named checkpoint you can revert to. Unsaved-change hints appear below the canvas.',
      placement: 'bottom',
    },
    {
      selector: '.tabs button:nth-of-type(4)',
      title: 'Report tab',
      body: 'Once responses arrive, the Report tab summarises them with charts, per-question breakdowns and AI analysis.',
      placement: 'bottom',
    },
  ],
};

export const FORM_RESPOND_TOUR: TourDefinition = {
  id: 'form-respond',
  title: 'Responding to a form',
  subtitle: 'Fill in, save drafts and submit',
  icon: 'square-check',
  section: 'Field intelligence',
  roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer'],
  routes: ['/forms/[id]/respond'],
  entry: '/forms',
  dynamic: true,
  startHint: 'Open a published form and press Fill in to take this tour.',
  steps: [
    {
      selector: '.form-layout__header',
      title: 'Form header',
      body: 'You are filling in a published form. The header shows its title and description — only published forms accept submissions.',
      placement: 'bottom',
    },
    {
      selector: '.input',
      title: 'Form password',
      body: 'If the form is password-protected, enter the access password shared by your coordinator to unlock the questions.',
      placement: 'bottom',
    },
    {
      selector: '.hint',
      title: 'Instructions and consent',
      body: 'Description and consent text appear above the questions — read them once; GDPR consent may be required before submitting.',
      placement: 'bottom',
    },
    {
      selector: '.form-layout__actions',
      title: 'Save draft or submit',
      body: 'Save as draft keeps your answers for later; Submit sends them to the Responses list for review. Resubmission is blocked if you already answered.',
      placement: 'top',
    },
  ],
};
