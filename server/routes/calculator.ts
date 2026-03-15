import { Router, Request, Response } from "express";

const router = Router();

router.get("/calc", (req: Request, res: Response) => {
  try {
    const amount = parseFloat(req.query.amount as string);
    const tenure = parseInt(req.query.tenure as string);
    const creditScore = parseInt(req.query.creditScore as string) || 500;

    if (!amount || !tenure || isNaN(amount) || isNaN(tenure)) {
      return res.status(400).json({ error: "amount and tenure are required" });
    }

    let interestRate: number;
    if (creditScore >= 750) interestRate = 8;
    else if (creditScore >= 600) interestRate = 12;
    else interestRate = 18;

    const totalDue = amount + (amount * interestRate * tenure) / (100 * 12);
    const monthlyEmi = totalDue / tenure;

    res.json({
      amount,
      tenure,
      creditScore,
      interestRate,
      monthlyEmi: Math.round(monthlyEmi * 100) / 100,
      totalDue: Math.round(totalDue * 100) / 100,
      totalInterest: Math.round((totalDue - amount) * 100) / 100,
    });
  } catch (error) {
    console.error("Calculator error:", error);
    res.status(500).json({ error: "Calculation failed" });
  }
});

export default router;
