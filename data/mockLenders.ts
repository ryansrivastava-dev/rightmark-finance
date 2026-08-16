export const MOCK_LENDERS = [
  { name: "Harbor Capital", preferredAssets: ["Fishing quota"], maximumLtv: 55, minimumScore: 78, maximumLoan: 250000, riskTolerance: "Moderate" },
  { name: "Coastal Bank", preferredAssets: ["Fishing quota", "Water-linked right"], maximumLtv: 50, minimumScore: 82, maximumLoan: 500000, riskTolerance: "Moderate-low" },
  { name: "BlueWave Finance", preferredAssets: ["Fishing quota", "Taxi medallion", "Spectrum license"], maximumLtv: 60, minimumScore: 72, maximumLoan: 150000, riskTolerance: "Moderate-high" },
] as const;
