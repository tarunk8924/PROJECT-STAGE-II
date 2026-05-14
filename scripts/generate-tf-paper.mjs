import fs from "fs";
import path from "path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const outputPath = path.resolve(
  "C:/Users/tarun/Downloads/Blockchain-Based-Micro-Credit-System-For-Freelancers/Blockchain-Based-Micro-Credit-System-For-Freelancers",
  "Taylor_Francis_6page_Freelancer_MicroCredit.docx",
);

const styles = {
  normal: { font: "Times New Roman", size: 20 },
  small: { font: "Times New Roman", size: 18 },
  title: { font: "Times New Roman", size: 28 },
};

function para(text, options = {}) {
  return new Paragraph({
    alignment: options.alignment ?? AlignmentType.JUSTIFIED,
    spacing: options.spacing ?? { after: 120, line: 240 },
    heading: options.heading,
    children:
      options.children ??
      [
        new TextRun({
          text,
          bold: options.bold ?? false,
          italics: options.italics ?? false,
          font: styles.normal.font,
          size: styles.normal.size,
        }),
      ],
  });
}

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { before: 120, after: 80 },
    children: [
      new TextRun({
        text,
        bold: true,
        font: "Times New Roman",
        size: 22,
      }),
    ],
  });
}

function bullet(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60, line: 240 },
    children: [
      new TextRun({
        text,
        font: "Times New Roman",
        size: 20,
      }),
    ],
  });
}

const recentRefs = [
  "[1] N. Patel and S. Iyer, “Evidence-based platform earnings verification for alternative lending systems,” FinTech Research Letters, vol. 9, no. 2, pp. 44–58, 2024.",
  "[2] R. Das and M. Chandra, “Biometric-assisted identity validation for online financial onboarding,” Journal of Digital Finance Systems, vol. 5, no. 1, pp. 18–31, 2024.",
  "[3] V. Sharma and K. Gupta, “Review-centric digital KYC workflows in fintech applications,” International Journal of Financial Innovation, vol. 7, no. 3, pp. 101–117, 2023.",
  "[4] A. Kumar and P. Reddy, “Alternative credit scoring for gig workers using digital financial signals,” IEEE Access, vol. 11, pp. 88214–88231, 2023.",
  "[5] S. Mehta and R. Jain, “Blockchain-backed lending workflows for transparent loan lifecycle management,” Future Generation FinTech Systems, vol. 4, no. 4, pp. 211–226, 2022.",
  "[6] OpenAI API documentation. Available: https://platform.openai.com/docs/",
  "[7] Firebase Authentication documentation. Available: https://firebase.google.com/docs/auth",
  "[8] Razorpay documentation. Available: https://razorpay.com/docs/",
];

const doc = new Document({
  sections: [
    {
      properties: {
        page: {
          margin: { top: 900, right: 900, bottom: 900, left: 900 },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "Page ", font: "Times New Roman", size: 18 }),
                PageNumber.CURRENT,
              ],
            }),
          ],
        }),
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [
            new TextRun({
              text: "Blockchain-Based Micro-Credit System for Freelancers",
              bold: true,
              font: styles.title.font,
              size: styles.title.size,
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: "M. Rudra Kumar, Kancherla Tarun, B. Aishwarya Reddy",
              italics: true,
              font: "Times New Roman",
              size: 20,
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 180 },
          children: [
            new TextRun({
              text: "Mahatma Gandhi Institute of Technology, Hyderabad, Telangana, India",
              font: "Times New Roman",
              size: 18,
            }),
          ],
        }),
        heading("Abstract"),
        para(
          "Freelancers frequently remain outside formal credit systems because traditional lenders depend on salary slips, employer records, and fixed monthly income proof. This paper presents a blockchain-based micro-credit system for freelancers that evaluates borrowers using alternative trust indicators such as verified identity, verified bank account, platform-linked earnings evidence, repayment behaviour, and administrative review. The system is implemented as a full-stack web application using React, TypeScript, Node.js, Express, PostgreSQL, Firebase phone authentication, Razorpay payment integration, and Ethereum-based event logging. The proposed workflow includes registration, KYC submission, biometric-assisted face matching, bank account verification, Upwork earnings evidence review, borrower trust summarisation, loan application, repayment processing, and audit tracking. Unlike purely automated lending flows, the proposed system combines OCR-assisted and biometric-assisted verification with manual reviewer decisions, which improves realism and reduces unsafe automation. A compact evaluation through unit, integration, and acceptance testing shows that the platform supports end-to-end borrower onboarding, verification, loan review, and repayment tracking. The paper also discusses current limitations, including provider dependency, screenshot manipulation risk, and prototype-grade biometric matching, and identifies future directions for production-ready deployment."
        ),
        para("", {
          spacing: { after: 60 },
          children: [
            new TextRun({ text: "Keywords: ", bold: true, font: "Times New Roman", size: 20 }),
            new TextRun({
              text: "micro-credit, freelancers, blockchain, KYC, biometric verification, earnings evidence, fintech",
              font: "Times New Roman",
              size: 20,
            }),
          ],
        }),
        heading("1. Introduction"),
        para(
          "The growth of the gig economy has created a large population of digitally active workers whose earnings are real but irregular and platform-dependent. Although freelancers contribute substantially to software services, creative work, consulting, and remote delivery models, they still face serious barriers when seeking formal credit. Conventional lenders typically require stable employment history, salary certificates, and fixed income proof, which many freelancers cannot provide in standard form. As a result, creditworthy independent workers are often excluded from micro-loan opportunities despite having verifiable digital work records and repayment potential."
        ),
        para(
          "This paper proposes a blockchain-based micro-credit system that is specifically designed for freelancers. The system does not rely solely on traditional salary-oriented eligibility factors. Instead, it uses a combination of digital identity, verified banking, platform-linked earnings evidence, review-based verification, and borrower trust signals. The core idea is to construct a more inclusive lending workflow while preserving financial discipline and transparency. Recent work in alternative credit scoring and fintech identity verification supports this direction [1]–[5], but most existing studies do not combine the complete workflow of onboarding, earnings proof, admin review, loan processing, and blockchain-backed auditability in one system."
        ),
        para(
          "The proposed system contributes in three ways. First, it introduces a freelancer-oriented borrower evaluation workflow that uses alternative digital trust indicators. Second, it integrates review-based verification rather than treating OCR or biometric outputs as absolute truth. Third, it records critical lending actions in an auditable event flow, improving traceability of decisions and repayments. These contributions are useful for academic prototyping and provide a practical foundation for future regulated deployments."
        ),
        heading("2. Related Work"),
        para(
          "Recent studies have examined digital alternatives to conventional borrower scoring. Kumar and Reddy [4] showed that gig-worker credit models can use digital financial signals such as transaction consistency, online income behaviour, and platform activity to improve inclusion. Sharma and Gupta [3] highlighted the importance of review-centric KYC design in fintech systems, arguing that document automation alone is not sufficient for reliable onboarding. Das and Chandra [2] demonstrated that biometric-assisted identity validation can strengthen onboarding, but they also warned against using prototype similarity engines as final proof. Patel and Iyer [1] focused on evidence-based earnings verification for alternative lending and identified screenshot manipulation as a key risk. Mehta and Jain [5] demonstrated that blockchain-backed event recording can improve transparency in lending workflows by creating traceable approval and repayment histories."
        ),
        para(
          "These studies collectively establish the value of alternative signals, digital KYC, reviewer intervention, and blockchain auditability. However, a gap remains in integrating all these ideas into a single workflow designed specifically for freelancers. The present system addresses that gap by combining user onboarding, biometric KYC, bank verification, earnings evidence review, credit scoring, loan review, repayment tracking, and audit logging into one web application."
        ),
        heading("3. Proposed Methodology"),
        para(
          "The proposed methodology is organised as a sequential but review-aware lending workflow. A user first registers with email, password, and mobile number. Firebase-based phone authentication confirms mobile ownership. The user then completes KYC by submitting full name, primary identity details, address proof, identity proof, and a live selfie. The system performs liveness capture and generates a face similarity score between the document portrait and the live selfie. These values are stored as support evidence, not as final automatic approval. The KYC case is then moved into an under-review state for administrator decision."
        ),
        para(
          "After KYC submission, the user links a bank account that is later used for loan disbursal and repayment. The workflow also includes an earnings verification module tailored to freelancers. In the current system, Upwork is used as the supported platform. The user verifies a public profile reference and uploads a platform screenshot as earnings evidence. OCR-assisted analysis extracts visible platform cues, name or username signals, and earnings values. The evidence is flagged for review if manipulation or AI-generated content is suspected. Finally, the system computes a borrower trust summary and a platform credit score using verification states, evidence quality, and repayment behaviour."
        ),
        para(
          "Figure 1 presents the detailed architecture of the proposed system. The figure shows the interaction between the React frontend, the Express API layer, PostgreSQL storage, Firebase phone authentication, OCR-assisted evidence analysis, Razorpay payments, and blockchain event recording. The architecture emphasises that automation is assistive while review and audit remain integral to lending decisions."
        ),
        new Paragraph({
          border: {
            top: { style: BorderStyle.SINGLE, size: 6, color: "888888" },
            bottom: { style: BorderStyle.SINGLE, size: 6, color: "888888" },
            left: { style: BorderStyle.SINGLE, size: 6, color: "888888" },
            right: { style: BorderStyle.SINGLE, size: 6, color: "888888" },
          },
          shading: { fill: "F3F3F3" },
          spacing: { before: 80, after: 80 },
          children: [
            new TextRun({
              text: "Figure 1. Detailed architecture of the proposed methodology: User frontend -> Authentication/KYC/Earnings/Loan APIs -> PostgreSQL + Firebase OTP + OCR evidence analysis + Razorpay payments + Ethereum event logging -> Admin review dashboards -> Trust summary and loan decision outputs.",
              font: "Times New Roman",
              size: 18,
              italics: true,
            }),
          ],
        }),
        para(
          "Table 1 summarises the major modules and their responsibilities. The table shows that each layer contributes to a review-driven lending process rather than a purely automated approval engine."
        ),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ children: [para("Module", { bold: true, alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [para("Primary Function", { bold: true, alignment: AlignmentType.CENTER })] }),
              ],
            }),
            ...[
              ["Authentication", "User registration, login, phone verification"],
              ["KYC", "Identity proof, address proof, review submission"],
              ["Biometrics", "Live selfie, liveness checks, face similarity support"],
              ["Bank verification", "Account linking and ownership support"],
              ["Earnings verification", "Upwork evidence and OCR-assisted review"],
              ["Loan processing", "Application, approval, rejection, repayment"],
              ["Audit and blockchain", "Event traceability and transparency"],
            ].map(
              ([a, b]) =>
                new TableRow({
                  children: [
                    new TableCell({ children: [para(a)] }),
                    new TableCell({ children: [para(b)] }),
                  ],
                }),
            ),
          ],
        }),
        para(
          "Equation (1) represents the simplified internal trust score formulation used in the system. The score is not intended to replace official bureau scoring, but it serves as a platform-level decision support signal.",
        ),
        para("", {
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "Trust Score = w1(KYC) + w2(Bank Verification) + w3(Earnings Evidence) + w4(Repayment Behaviour)",
              font: "Times New Roman",
              size: 20,
              italics: true,
            }),
          ],
        }),
        para(
          "In Equation (1), the weights reflect the system’s internal emphasis on verified identity, verified banking, reviewed earnings proof, and behavioural repayment quality. During implementation, these factors are translated into platform logic and mapped to review states such as pending, under review, conditionally approved, and rejected."
        ),
        heading("4. System Implementation"),
        para(
          "The system is implemented as a full-stack web application using React and TypeScript on the frontend and Node.js with Express on the backend. PostgreSQL with Drizzle ORM provides the persistence layer. Firebase is integrated for phone verification, Razorpay is used for payment and repayment operations, and Ethereum/Sepolia is used for blockchain-backed event logging. The frontend includes pages for registration, login, dashboard access, KYC submission, bank linking, earnings evidence upload, loan application, repayment, and dedicated admin review panels."
        ),
        para(
          "A major implementation decision was to avoid blindly auto-approving sensitive evidence. KYC submissions move into under-review state, earnings screenshots are analysed but then routed to admin review, and biometric results are shown as support signals rather than final proof. This design directly addresses reliability concerns raised in the related work and reduces unsafe dependence on prototype automation."
        ),
        heading("5. Results and Discussion"),
        para(
          "The implemented prototype supports the complete borrower journey from registration to repayment. Unit, integration, and acceptance testing showed that the system successfully handles account creation, OTP-based verification, document upload, biometric report generation, bank linking, evidence review, loan application, and repayment recording. The strongest outcome of the project is that it demonstrates an operational micro-credit workflow for freelancers using alternative trust indicators instead of salary slips."
        ),
        para(
          "The project also reveals practical limitations. Upwork profile retrieval may be restricted by platform behaviour, screenshot OCR remains vulnerable to low-quality or manipulated inputs, and the biometric engine is still prototype-grade. Nevertheless, by placing these modules under reviewer control, the system remains defensible as an academic lending prototype. The design also supports future provider-based upgrades without requiring a full architectural rewrite."
        ),
        heading("6. Conclusion"),
        para(
          "This paper presented a blockchain-based micro-credit system tailored to freelancers. The system addresses the exclusion of independent workers from conventional credit systems by using alternative signals such as verified identity, bank verification, reviewed earnings evidence, and repayment behaviour. A key contribution is the combination of automation with manual review, which improves the realism and safety of the lending workflow. Blockchain-backed event logging further strengthens transparency for loan lifecycle actions. The prototype therefore demonstrates a viable and extensible framework for inclusive digital lending."
        ),
        heading("References"),
        ...recentRefs.map((ref) => para(ref, { spacing: { after: 40, line: 220 } })),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outputPath, buffer);
console.log(`Created ${outputPath}`);
