export type PersonStatus = "Available" | "In a meeting" | "Away";
export type WorkMode = "Remote" | "Hybrid" | "Office";

export type Person = {
  id: number | string;
  name: string;
  title: string;
  department: string;
  location: string;
  status: PersonStatus;
  workMode: WorkMode;
  avatar: string;
  email: string;
  phone: string;
  timezone: string;
  localTime: string;
  joined: string;
  bio: string;
  skills: string[];
  projects: string[];
  username?: string;
  statusEmoji?: string;
  hasPhoto?: boolean;
  region?: string;
  country?: string;
};

const skillsByDepartment: Record<string, string[]> = {
  Design: ["Figma", "Prototyping", "Design systems", "Research"],
  Engineering: ["React", "TypeScript", "Node.js", "Systems"],
  Product: ["Strategy", "Analytics", "Discovery", "Roadmaps"],
  Marketing: ["Content", "Campaigns", "SEO", "Brand"],
  People: ["Culture", "Coaching", "Hiring", "Operations"],
  Finance: ["Forecasting", "Reporting", "Strategy", "Planning"],
};

const locationDetails: Record<string, [string, string]> = {
  "Lagos, Nigeria": ["WAT · UTC+1", "10:24 AM"],
  "London, UK": ["BST · UTC+1", "10:24 AM"],
  "Lisbon, Portugal": ["WEST · UTC+1", "10:24 AM"],
  "New York, USA": ["EDT · UTC-4", "5:24 AM"],
  "Toronto, Canada": ["EDT · UTC-4", "5:24 AM"],
  "Berlin, Germany": ["CEST · UTC+2", "11:24 AM"],
  "Nairobi, Kenya": ["EAT · UTC+3", "12:24 PM"],
  "Cape Town, SA": ["SAST · UTC+2", "11:24 AM"],
  "Austin, USA": ["CDT · UTC-5", "4:24 AM"],
};

const seedPeople: Array<[string, string, string, string, PersonStatus, WorkMode, number]> = [
  ["Maya Chen", "Senior Product Designer", "Design", "London, UK", "Available", "Hybrid", 47],
  ["Marcus Johnson", "Frontend Engineer", "Engineering", "Lagos, Nigeria", "In a meeting", "Remote", 12],
  ["Sofia Ramirez", "Product Manager", "Product", "Lisbon, Portugal", "Available", "Remote", 32],
  ["Noah Williams", "Staff Software Engineer", "Engineering", "New York, USA", "Away", "Hybrid", 11],
  ["Amara Okafor", "People Operations Lead", "People", "Lagos, Nigeria", "Available", "Office", 44],
  ["Elijah Kim", "Brand Designer", "Design", "Toronto, Canada", "Available", "Remote", 8],
  ["Priya Shah", "Growth Marketing Lead", "Marketing", "London, UK", "In a meeting", "Hybrid", 49],
  ["Jonas Becker", "Platform Engineer", "Engineering", "Berlin, Germany", "Available", "Office", 13],
  ["Zuri Kamau", "UX Researcher", "Design", "Nairobi, Kenya", "Away", "Remote", 45],
  ["Theo Martins", "Product Marketing Manager", "Marketing", "Lagos, Nigeria", "Available", "Hybrid", 15],
  ["Adaeze Nwosu", "Mobile Engineer", "Engineering", "Lagos, Nigeria", "Available", "Remote", 41],
  ["Olivia Thompson", "Director of Product", "Product", "New York, USA", "In a meeting", "Office", 5],
  ["Kwame Mensah", "Data Engineer", "Engineering", "London, UK", "Available", "Remote", 17],
  ["Lucia Moretti", "Content Strategist", "Marketing", "Lisbon, Portugal", "Away", "Remote", 25],
  ["Ben Adeyemi", "Engineering Manager", "Engineering", "Lagos, Nigeria", "Available", "Hybrid", 14],
  ["Lena Hoffmann", "Finance Partner", "Finance", "Berlin, Germany", "In a meeting", "Office", 26],
  ["Chiamaka Eze", "Product Designer", "Design", "Lagos, Nigeria", "Available", "Remote", 48],
  ["Lucas Brown", "Solutions Architect", "Engineering", "Austin, USA", "Away", "Hybrid", 33],
  ["Nia Roberts", "Talent Partner", "People", "Toronto, Canada", "Available", "Remote", 42],
  ["Samuel Dlamini", "Product Analyst", "Product", "Cape Town, SA", "Available", "Office", 18],
  ["Aisha Bello", "Lifecycle Marketer", "Marketing", "Lagos, Nigeria", "In a meeting", "Hybrid", 43],
  ["Mateo Silva", "Design Systems Lead", "Design", "Lisbon, Portugal", "Available", "Remote", 21],
  ["Grace Taylor", "Technical Program Manager", "Product", "London, UK", "Away", "Hybrid", 9],
  ["Emeka Obi", "Backend Engineer", "Engineering", "Lagos, Nigeria", "Available", "Remote", 53],
  ["Harper Wilson", "Financial Analyst", "Finance", "New York, USA", "Available", "Office", 10],
  ["Fatima Hassan", "Employee Experience Manager", "People", "Nairobi, Kenya", "In a meeting", "Remote", 46],
  ["Alex Morgan", "Creative Director", "Design", "Austin, USA", "Available", "Hybrid", 6],
];

const projectNames = ["Atlas redesign", "New markets", "Mobile refresh", "Customer 360", "Design system", "Developer platform"];

export const people: Person[] = seedPeople.map((person, index) => {
  const [name, title, department, location, status, workMode, avatarId] = person;
  const slug = name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
  const [timezone, localTime] = locationDetails[location];

  return {
    id: index + 1,
    name,
    title,
    department,
    location,
    status,
    workMode,
    avatar: `https://i.pravatar.cc/320?img=${avatarId}`,
    email: `${slug}@mingle.team`,
    phone: `+1 (415) 555-${String(1200 + index * 17).slice(-4)}`,
    timezone,
    localTime,
    joined: `${["Jan", "Mar", "May", "Jul", "Sep", "Nov"][index % 6]} ${2020 + (index % 5)}`,
    bio: `${name.split(" ")[0]} helps the ${department.toLowerCase()} team turn ambitious ideas into clear, useful outcomes. They care about thoughtful craft, generous collaboration, and making complex work feel simple.`,
    skills: skillsByDepartment[department].slice(0, 2 + (index % 3)),
    projects: [projectNames[index % projectNames.length], projectNames[(index + 2) % projectNames.length]],
  };
});
