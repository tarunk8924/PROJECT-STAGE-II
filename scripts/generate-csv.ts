import fs from "fs";
import path from "path";

const platforms = ["Upwork", "Fiverr", "Freelancer.com"];
const descriptions: Record<string, string[]> = {
  "Upwork": [
    "Web Development Project", "React Frontend Build", "API Integration",
    "UI/UX Design Review", "Node.js Backend Service", "Database Optimization",
    "Mobile App Development", "WordPress Plugin", "SEO Optimization",
    "Technical Writing", "Code Review", "Bug Fix Sprint",
    "Full Stack Project", "DevOps Setup", "Landing Page Design"
  ],
  "Fiverr": [
    "Logo Design", "Video Editing", "Social Media Management",
    "Content Writing", "Graphic Design", "Translation Service",
    "Voice Over", "Data Entry", "Virtual Assistant",
    "Photo Editing", "Illustration", "Whiteboard Animation",
    "Podcast Editing", "Resume Writing", "Copywriting"
  ],
  "Freelancer.com": [
    "Python Script Development", "Data Analysis Report", "Excel Automation",
    "Machine Learning Model", "Shopify Store Setup", "Android App",
    "Cloud Migration", "Cybersecurity Audit", "Blockchain Integration",
    "Game Development", "IoT Dashboard", "ERP Customization",
    "Chatbot Development", "Payment Gateway Setup", "ETL Pipeline"
  ],
};

const firstNames = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Ayaan", "Krishna", "Ishaan",
  "Ananya", "Diya", "Priya", "Isha", "Kavya", "Meera", "Riya", "Saanvi", "Tanvi", "Pooja",
  "Rahul", "Rohan", "Karan", "Vikram", "Amit", "Suresh", "Rajesh", "Deepak", "Manoj", "Nikhil",
  "Sneha", "Neha", "Divya", "Anjali", "Shruti", "Pallavi", "Swati", "Nisha", "Preeti", "Megha",
  "Arun", "Harish", "Ganesh", "Siddharth", "Pranav", "Varun", "Akash", "Vishal", "Naveen", "Sachin",
  "Lakshmi", "Radha", "Sunita", "Geeta", "Seema", "Rekha", "Rani", "Jaya", "Usha", "Mala",
  "Mohit", "Tushar", "Gaurav", "Pankaj", "Ashish", "Vinod", "Sunil", "Ramesh", "Girish", "Anand",
  "Kirti", "Bhavna", "Chitra", "Damini", "Ekta", "Falguni", "Gauri", "Hema", "Ileana", "Janaki",
  "Tarun", "Umesh", "Venkat", "Wasim", "Yash", "Zeeshan", "Bhaskar", "Chandan", "Dhruv", "Eshan",
  "Kamini", "Latika", "Madhuri", "Namita", "Omika", "Padma", "Rashmi", "Sonal", "Tara", "Uma"
];

const lastNames = [
  "Sharma", "Verma", "Patel", "Singh", "Kumar", "Gupta", "Reddy", "Nair", "Iyer", "Joshi",
  "Mehta", "Shah", "Pillai", "Menon", "Rao", "Das", "Bose", "Ghosh", "Mukherjee", "Banerjee",
  "Mishra", "Pandey", "Tiwari", "Dubey", "Shukla", "Yadav", "Chauhan", "Rajput", "Agarwal", "Saxena",
  "Thakur", "Deshmukh", "Kulkarni", "Patil", "Jain", "Srivastava", "Chopra", "Kapoor", "Malhotra", "Bhatia",
  "Khanna", "Bajaj", "Sethi", "Ahuja", "Chadha", "Dhawan", "Arora", "Khurana", "Tandon", "Grover"
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateCSV() {
  const rows: string[] = [];
  rows.push("user_name,email,platform,amount,currency,description,earned_at");

  const users: { name: string; email: string }[] = [];
  const usedEmails = new Set<string>();

  for (let i = 0; i < 100; i++) {
    let name: string, email: string;
    do {
      const first = randomElement(firstNames);
      const last = randomElement(lastNames);
      name = `${first} ${last}`;
      email = `${first.toLowerCase()}.${last.toLowerCase()}${randomInt(1, 99)}@gmail.com`;
    } while (usedEmails.has(email));
    usedEmails.add(email);
    users.push({ name, email });
  }

  for (const user of users) {
    const numPlatforms = randomInt(1, 3);
    const userPlatforms = [...platforms].sort(() => Math.random() - 0.5).slice(0, numPlatforms);

    for (const platform of userPlatforms) {
      const numEntries = randomInt(3, 8);

      for (let j = 0; j < numEntries; j++) {
        const amount = (randomInt(500, 25000) + randomInt(0, 99) / 100).toFixed(2);
        const daysAgo = randomInt(1, 180);
        const earnedAt = new Date();
        earnedAt.setDate(earnedAt.getDate() - daysAgo);
        const dateStr = earnedAt.toISOString().split("T")[0];

        const desc = randomElement(descriptions[platform]);

        rows.push(`"${user.name}","${user.email}","${platform}",${amount},INR,"${desc}",${dateStr}`);
      }
    }
  }

  const csvContent = rows.join("\n");
  const outputPath = path.join(process.cwd(), "data", "gig_earnings_100_users.csv");

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, csvContent, "utf-8");

  console.log(`CSV generated: ${outputPath}`);
  console.log(`Total rows: ${rows.length - 1} (excluding header)`);
  console.log(`Users: ${users.length}`);
}

generateCSV();
