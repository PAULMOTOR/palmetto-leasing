/** Brand crest paths for minimal card UI */
export function brandCrest(make: string): string {
  const m = make.toLowerCase();
  if (m.includes("porsche")) return "/brands/porsche.svg";
  if (m.includes("ferrari")) return "/brands/ferrari.svg";
  if (m.includes("rolls")) return "/brands/rolls-royce.svg";
  if (m.includes("bmw")) return "/brands/bmw.svg";
  if (m.includes("mercedes") || m.includes("amg")) return "/brands/mercedes.svg";
  if (m.includes("mclaren")) return "/brands/mclaren.svg";
  if (m.includes("lamborghini")) return "/brands/lamborghini.svg";
  if (m.includes("bentley")) return "/brands/bentley.svg";
  if (m.includes("aston")) return "/brands/aston.svg";
  if (m.includes("audi")) return "/brands/audi.svg";
  if (m.includes("land rover") || m.includes("range")) return "/brands/land-rover.svg";
  if (m.includes("jaguar")) return "/brands/jaguar.svg";
  return "/brands/default.svg";
}
