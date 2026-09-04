// #251 -- the three reserved, seeded demo accounts a visitor can explore
// before signing up. Single source of truth for both server code (reserving
// the usernames at registration, gating public performance-insight data)
// and client code (the apex page's persona picker, the public profile
// page's demo-only affordances) -- one list, not three independently
// maintained copies.
export const DEMO_PERSONAS = [
  {
    username: "beginnerdemo",
    label: "Beginner",
    description: "Just starting out -- early V-grade boulders, first leads on toprope and easy sport routes.",
  },
  {
    username: "intermediatedemo",
    label: "Intermediate",
    description: "A season or two in -- consistent mid-grade sends, a few onsight/redpoint projects on the go.",
  },
  {
    username: "advanceddemo",
    label: "Advanced",
    description: "Years of mileage -- hard boulder/lead grades, a long send history across disciplines.",
  },
];

export const DEMO_USERNAMES = DEMO_PERSONAS.map(p => p.username);
