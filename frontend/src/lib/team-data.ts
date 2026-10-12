// Structured configuration for the KG-MIS Development Team page.
export interface TeamMember {
  id: string;
  order: number;
  name: string;
  title: string;
  /** Primary contribution area shown on the card */
  area: string;
  email: string;
  linkedin: string;
  portfolio?: string;
  /** Path under /public */
  photo: string;
  alt: string;
  contributions: string[];
}

export const TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'melkamu-alamerew',
    order: 1,
    name: 'Melkamu Alamerew',
    title: 'Chief Technology Officer',
    area: 'Executive Technology Leadership & Strategic Oversight',
    email: 'melkamu.alamerew@kerchanshe.com',
    linkedin: 'https://www.linkedin.com/in/melkamu-a-4561212b',
    photo: '/team/melkamu-alamerew.jpg',
    alt: 'Melkamu Alamerew, Chief Technology Officer',
    contributions: [
      'Technology leadership and strategic direction for the platform',
      'Enterprise-level technical oversight and governance',
      'Executive guidance on platform priorities and standards',
    ],
  },
  {
    id: 'woluman-urgesa',
    order: 2,
    name: 'Woluman Urgesa',
    title: 'Full Stack Developer',
    area: 'Primary Developer & Technical Lead',
    email: 'woluman.urgesa@kerchanshe.net',
    linkedin: 'https://www.linkedin.com/in/woluman-u-feyisa-94255a352/',
    portfolio: 'https://woluman-urgesa.gt.tc/',
    photo: '/team/woluman-urgesa.jpg',
    alt: 'Woluman Urgesa, Full Stack Developer and Technical Lead',
    contributions: [
      'Overall system architecture and technical design',
      'Core frontend and backend development across modules and APIs',
      'Database integration, workflows, and deployment',
      'Performance optimization and ongoing maintenance',
    ],
  },
  {
    id: 'estifanos-alemseged',
    order: 3,
    name: 'Estifanos Alemseged',
    title: 'Enterprise System & Application Head',
    area: 'System Validation & Enterprise Integration Coordination',
    email: 'estifanos.alemseged@kerchanshe.net',
    linkedin: 'https://www.linkedin.com/in/estifanos-alemseged',
    photo: '/team/estifanos-alemseged.jpg',
    alt: 'Estifanos Alemseged, Enterprise System and Application Head',
    contributions: [
      'System functionality testing coordination',
      'Functional validation of platform capabilities',
      'D365FO API integration facilitation',
      'ERP requirements and enterprise application coordination',
    ],
  },
  {
    id: 'kidus-solomon',
    order: 4,
    name: 'Kidus Solomon',
    title: 'Full Stack Programmer II | Solution Development Head',
    area: 'Initial Requirements, Technical Design & Architecture Consultation',
    email: 'kidus.solomon@kerchanshe.net',
    linkedin: 'https://www.linkedin.com/in/kidus-solomon-35a03121a',
    photo: '/team/kidus-solomon.jpg',
    alt: 'Kidus Solomon, Full Stack Programmer II and Solution Development Head',
    contributions: [
      'Initial NextForm user requirements',
      'Technical Design Document (TDD)',
      'Initial system architecture consultation',
      'Technical guidance for solution development',
    ],
  },
  {
    id: 'tsegaye-nigussie',
    order: 5,
    name: 'Tsegaye Nigussie',
    title: 'Marketing Researcher',
    area: 'Business Requirements & Process Definition',
    email: 'tsegaye.nigusie@kerchanshe.net',
    linkedin: 'https://www.linkedin.com/in/tsegayenigusiebalcha1916',
    photo: '/team/tsegaye-nigussie.jpg',
    alt: 'Tsegaye Nigussie, Marketing Researcher',
    contributions: [
      'Business requirements gathering',
      'Marketing research insights',
      'Business processes and functional requirements',
      'Business logic and functional validation',
    ],
  },
  {
    id: 'dawit-bayou',
    order: 6,
    name: 'Dawit Bayou',
    title: 'Full Stack Developer II',
    area: 'SSO Development & Integration',
    email: 'dawit.bayou@kerchanshe.net',
    linkedin: 'https://www.linkedin.com/in/dawit-b-kassie',
    photo: '/team/dawit-bayou.jpg',
    alt: 'Dawit Bayou, Full Stack Developer II',
    contributions: [
      'Single Sign-On (SSO) module development',
      'SSO API endpoints',
      'Comprehensive API documentation',
      'Authentication integration',
    ],
  },
];

/** Contribution overview chips shown above the team grid. */
export const CONTRIBUTION_AREAS = [
  { icon: 'fa-solid fa-compass-drafting', label: 'Technology Leadership' },
  { icon: 'fa-solid fa-code', label: 'Software Engineering' },
  { icon: 'fa-solid fa-clipboard-check', label: 'System Validation & Integration' },
  { icon: 'fa-solid fa-diagram-project', label: 'Architecture & Design' },
  { icon: 'fa-solid fa-magnifying-glass-chart', label: 'Business Requirements & Research' },
  { icon: 'fa-solid fa-key', label: 'SSO & Authentication' },
];

export const TEAM_INTRO =
  "KG-MIS is a collaborative initiative combining technology leadership, software engineering, business intelligence, marketing research, and enterprise application integration. The following team members contributed to the platform's strategic direction, requirements definition, development, integration, and validation.";
