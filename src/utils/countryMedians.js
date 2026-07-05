// Rough approximations of annualized median salaries in USD for calculation purposes
export const COUNTRY_MEDIANS_USD = {
  // North America
  "US": 55000,
  "United States": 55000,
  "CA": 45000,
  "Canada": 45000,
  "MX": 10000,
  "Mexico": 10000,
  
  // Europe
  "GB": 40000,
  "United Kingdom": 40000,
  "DE": 45000,
  "Germany": 45000,
  "FR": 42000,
  "France": 42000,
  "IT": 35000,
  "Italy": 35000,
  "ES": 30000,
  "Spain": 30000,

  // Asia Pacific
  "AU": 50000,
  "Australia": 50000,
  "IN": 4000,
  "India": 4000,
  "PH": 5000,
  "Philippines": 5000,
  "SG": 45000,
  "Singapore": 45000,
  "MY": 12000,
  "Malaysia": 12000,
  "ID": 5000,
  "Indonesia": 5000,
  "AE": 35000,
  "United Arab Emirates": 35000,
  "SA": 25000,
  "Saudi Arabia": 25000,
  // Southeast Asia (ILO/World Bank Wage Data)
  "TH": 6000,
  "Thailand": 6000, // ILO 2024: ~18,000 THB/month median
  "MM": 1800,
  "Myanmar": 1800, // World Bank 2024: ~150 USD/month median
  "LA": 2000,
  "Laos": 2000, // ILO 2024: ~167 USD/month median
  "VN": 4200,
  "Vietnam": 4200, // General Statistics Office 2024: ~8.4M VND/month median
  "KH": 3600,
  "Cambodia": 3600, // ILO 2024: ~300 USD/month urban median (minimum garment is $204/mo)
  "TW": 18000,
  "Taiwan": 18000, // DGBAS 2024: ~43,000 NTD/month median

  // Default fallback if a recognized country is not heavily specified
  "GLOBAL_AVERAGE": 15000
};

export function getMedianSalary(countryName) {
  if (!countryName) return null;
  // Try exact match first
  if (COUNTRY_MEDIANS_USD[countryName]) {
    return COUNTRY_MEDIANS_USD[countryName];
  }
  
  // Try case-insensitive exact match
  const search = countryName.toLowerCase().trim();
  for (const [key, value] of Object.entries(COUNTRY_MEDIANS_USD)) {
    if (key.toLowerCase() === search) {
      return value;
    }
  }

  return COUNTRY_MEDIANS_USD["GLOBAL_AVERAGE"];
}
