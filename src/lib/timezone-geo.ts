const timezoneCountries: Record<string, string> = {
  "America/Los_Angeles": "United States",
  "America/New_York": "United States",
  "America/Chicago": "United States",
  "America/Denver": "United States",
  "America/Phoenix": "United States",
  "America/Indiana/Indianapolis": "United States",
  "America/Anchorage": "United States",
  "Pacific/Honolulu": "United States",
  "America/Mexico_City": "Mexico",
  "America/Tijuana": "Mexico",
  "America/Chihuahua": "Mexico",
  "America/Cancun": "Mexico",
  "America/Bogota": "Colombia",
  "America/Manaus": "Brazil",
  "America/Sao_Paulo": "Brazil",
  "America/Fortaleza": "Brazil",
  "America/Bahia": "Brazil",
  "America/Cuiaba": "Brazil",
  "America/Buenos_Aires": "Argentina",
  "America/Regina": "Canada",
  "America/Halifax": "Canada",
  "America/Santiago": "Chile",
  "America/Montevideo": "Uruguay",
  "America/Belize": "Belize",
  "America/Caracas": "Venezuela",
  "America/Asuncion": "Paraguay",
  "America/Havana": "Cuba",
  "America/Port-au-Prince": "Haiti",
  "America/Cayenne": "French Guiana",
  "Europe/Amsterdam": "Netherlands",
  "Europe/London": "United Kingdom",
  "Europe/Brussels": "Belgium",
  "Europe/Warsaw": "Poland",
  "Europe/Athens": "Greece",
  "Europe/Moscow": "Russia",
  "Europe/Belgrade": "Serbia",
  "Europe/Minsk": "Belarus",
  "Europe/Helsinki": "Finland",
  "Africa/Algiers": "Algeria",
  "Africa/Monrovia": "Liberia",
  "Africa/Nairobi": "Kenya",
  "Africa/Harare": "Zimbabwe",
  "Africa/Cairo": "Egypt",
  "Asia/Kolkata": "India",
  "Asia/Tokyo": "Japan",
  "Asia/Karachi": "Pakistan",
  "Asia/Jerusalem": "Israel",
  "Asia/Chongqing": "China",
  "Asia/Bangkok": "Thailand",
  "Asia/Kuala_Lumpur": "Malaysia",
  "Asia/Taipei": "Taiwan",
  "Asia/Muscat": "Oman",
  "Asia/Seoul": "South Korea",
  "Asia/Pyongyang": "North Korea",
  "Asia/Istanbul": "Türkiye",
  "Asia/Almaty": "Kazakhstan",
  "Asia/Yerevan": "Armenia",
  "Australia/Canberra": "Australia",
  "Australia/Brisbane": "Australia",
  "Pacific/Auckland": "New Zealand",
};

const locationCountries: Array<[string, string, string]> = [
  ["Nigeria", "Nigeria", "Africa"], ["Kenya", "Kenya", "Africa"], ["South Africa", "South Africa", "Africa"],
  ["UK", "United Kingdom", "Europe"], ["Portugal", "Portugal", "Europe"], ["Germany", "Germany", "Europe"],
  ["USA", "United States", "Americas"], ["Canada", "Canada", "Americas"],
];

export function timezoneGeo(timezone = "", location = "") {
  let region = "Unspecified";
  if (timezone.startsWith("America/")) region = "Americas";
  else if (timezone.startsWith("Europe/")) region = "Europe";
  else if (timezone.startsWith("Africa/")) region = "Africa";
  else if (timezone.startsWith("Asia/")) region = "Asia";
  else if (timezone.startsWith("Australia/") || timezone.startsWith("Pacific/")) region = "Oceania";
  else if (timezone.startsWith("Atlantic/")) region = "Atlantic";
  else if (timezone.startsWith("Indian/")) region = "Asia";

  let country = timezoneCountries[timezone] || "Unspecified";
  if (country === "Unspecified") {
    const match = locationCountries.find(([needle]) => location.includes(needle));
    if (match) {
      country = match[1];
      if (region === "Unspecified") region = match[2];
    }
  }

  return { region, country };
}
