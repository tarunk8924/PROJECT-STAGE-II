import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import fs from "fs";
import path from "path";

const figuresDir = path.resolve("figures");
if (!fs.existsSync(figuresDir)) fs.mkdirSync(figuresDir);

const width = 800;
const height = 500;

async function generateFigures() {
  const canvas = new ChartJSNodeCanvas({ width, height });

  const fig1 = await canvas.renderToBuffer({
    type: "bar",
    data: {
      labels: ["Accuracy (%)", "Precision (%)", "Recall (%)", "F1-Score (×100)"],
      datasets: [
        { label: "Proposed Model", data: [87.3, 85.6, 89.1, 87.3], backgroundColor: "rgba(54, 99, 235, 0.85)" },
        { label: "Traditional CIBIL Model", data: [71.2, 68.4, 74.8, 71.4], backgroundColor: "rgba(255, 159, 64, 0.85)" },
        { label: "Basic DeFi Model", data: [58.5, 55.2, 62.3, 58.6], backgroundColor: "rgba(201, 203, 207, 0.85)" },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        title: { display: true, text: "Figure 1: Credit Scoring Accuracy Comparison", font: { size: 16, weight: "bold" }, padding: { bottom: 20 } },
        legend: { position: "bottom", labels: { padding: 20 } },
      },
      scales: {
        y: { beginAtZero: true, max: 100, title: { display: true, text: "Score / Percentage" } },
        x: { title: { display: true, text: "Evaluation Metrics" } },
      },
    },
  });
  fs.writeFileSync(path.join(figuresDir, "figure1.png"), fig1);
  console.log("Figure 1 generated");

  const fig2 = await canvas.renderToBuffer({
    type: "bar",
    data: {
      labels: ["Loan Approval", "Repayment Recording", "Default Detection", "Audit Trail"],
      datasets: [
        { label: "Proposed System (minutes)", data: [4.2, 0.2, 360, 0.1], backgroundColor: "rgba(54, 99, 235, 0.85)" },
        { label: "Traditional Process (minutes)", data: [4320, 2160, 10080, 480], backgroundColor: "rgba(255, 99, 132, 0.85)" },
      ],
    },
    options: {
      responsive: false,
      indexAxis: "y",
      plugins: {
        title: { display: true, text: "Figure 2: Loan Processing Efficiency (Time in Minutes)", font: { size: 16, weight: "bold" }, padding: { bottom: 20 } },
        legend: { position: "bottom", labels: { padding: 20 } },
      },
      scales: {
        x: { type: "logarithmic", title: { display: true, text: "Time in Minutes (Log Scale)" } },
        y: { title: { display: true, text: "Operation" } },
      },
    },
  });
  fs.writeFileSync(path.join(figuresDir, "figure2.png"), fig2);
  console.log("Figure 2 generated");

  const fig3 = await canvas.renderToBuffer({
    type: "bar",
    data: {
      labels: ["Repeat Default\nRate", "On-Time\nRepayment", "Avg Interest\nRate", "P2P\nParticipation", "Borrower\nRetention"],
      datasets: [
        { label: "With Reputation System", data: [6.8, 78.3, 9.2, 34.2, 88.5], backgroundColor: "rgba(75, 192, 140, 0.85)" },
        { label: "Without Reputation System", data: [11.5, 64.1, 12.5, 12.7, 61.2], backgroundColor: "rgba(255, 99, 132, 0.85)" },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        title: { display: true, text: "Figure 3: Reputation System Impact on Borrower Behavior", font: { size: 16, weight: "bold" }, padding: { bottom: 20 } },
        legend: { position: "bottom", labels: { padding: 20 } },
      },
      scales: {
        y: { beginAtZero: true, max: 100, title: { display: true, text: "Percentage (%)" } },
        x: { title: { display: true, text: "Metrics" } },
      },
    },
  });
  fs.writeFileSync(path.join(figuresDir, "figure3.png"), fig3);
  console.log("Figure 3 generated");

  const fig4 = await canvas.renderToBuffer({
    type: "bar",
    data: {
      labels: ["Wallet\n(UPI)", "Wallet\n(Bank)", "Razorpay\n(Cards)", "Razorpay\n(UPI)", "Razorpay\n(Net Banking)"],
      datasets: [
        { label: "Success Rate (%)", data: [96.8, 94.5, 97.2, 98.1, 93.6], backgroundColor: "rgba(54, 99, 235, 0.85)", yAxisID: "y" },
        { label: "Avg Processing Time (sec)", data: [3.2, 8.7, 5.1, 2.8, 12.4], backgroundColor: "rgba(255, 159, 64, 0.85)", yAxisID: "y1" },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        title: { display: true, text: "Figure 4: Payment Channel Performance Comparison", font: { size: 16, weight: "bold" }, padding: { bottom: 20 } },
        legend: { position: "bottom", labels: { padding: 20 } },
      },
      scales: {
        y: { beginAtZero: true, max: 100, position: "left", title: { display: true, text: "Success Rate (%)" } },
        y1: { beginAtZero: true, max: 15, position: "right", title: { display: true, text: "Processing Time (seconds)" }, grid: { drawOnChartArea: false } },
        x: { title: { display: true, text: "Payment Channel" } },
      },
    },
  });
  fs.writeFileSync(path.join(figuresDir, "figure4.png"), fig4);
  console.log("Figure 4 generated");

  console.log("\nAll 4 figures saved to figures/ directory!");
}

generateFigures().catch(console.error);
