// Popular US stock symbols for search functionality
export interface StockInfo {
  symbol: string;
  name: string;
  sector?: string;
}

const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/;

// Top US stocks by market cap and trading volume
export const US_STOCKS: StockInfo[] = [
  // Technology
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology' },
  { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', sector: 'Technology' },
  { symbol: 'GOOG', name: 'Alphabet Inc. Class C', sector: 'Technology' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'Technology' },
  { symbol: 'META', name: 'Meta Platforms Inc.', sector: 'Technology' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology' },
  { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'Technology' },
  { symbol: 'AMD', name: 'Advanced Micro Devices Inc.', sector: 'Technology' },
  { symbol: 'INTC', name: 'Intel Corporation', sector: 'Technology' },
  { symbol: 'CRM', name: 'Salesforce Inc.', sector: 'Technology' },
  { symbol: 'ORCL', name: 'Oracle Corporation', sector: 'Technology' },
  { symbol: 'ADBE', name: 'Adobe Inc.', sector: 'Technology' },
  { symbol: 'CSCO', name: 'Cisco Systems Inc.', sector: 'Technology' },
  { symbol: 'AVGO', name: 'Broadcom Inc.', sector: 'Technology' },
  { symbol: 'QCOM', name: 'Qualcomm Inc.', sector: 'Technology' },
  { symbol: 'TXN', name: 'Texas Instruments Inc.', sector: 'Technology' },
  { symbol: 'IBM', name: 'International Business Machines', sector: 'Technology' },
  { symbol: 'NOW', name: 'ServiceNow Inc.', sector: 'Technology' },
  { symbol: 'SHOP', name: 'Shopify Inc.', sector: 'Technology' },
  { symbol: 'SQ', name: 'Block Inc.', sector: 'Technology' },
  { symbol: 'PYPL', name: 'PayPal Holdings Inc.', sector: 'Technology' },
  { symbol: 'UBER', name: 'Uber Technologies Inc.', sector: 'Technology' },
  { symbol: 'SNAP', name: 'Snap Inc.', sector: 'Technology' },
  { symbol: 'PINS', name: 'Pinterest Inc.', sector: 'Technology' },
  { symbol: 'TWLO', name: 'Twilio Inc.', sector: 'Technology' },
  { symbol: 'NET', name: 'Cloudflare Inc.', sector: 'Technology' },
  { symbol: 'DDOG', name: 'Datadog Inc.', sector: 'Technology' },
  { symbol: 'ZS', name: 'Zscaler Inc.', sector: 'Technology' },
  { symbol: 'CRWD', name: 'CrowdStrike Holdings Inc.', sector: 'Technology' },
  { symbol: 'SNOW', name: 'Snowflake Inc.', sector: 'Technology' },
  { symbol: 'PLTR', name: 'Palantir Technologies Inc.', sector: 'Technology' },
  { symbol: 'MU', name: 'Micron Technology Inc.', sector: 'Technology' },
  { symbol: 'AMAT', name: 'Applied Materials Inc.', sector: 'Technology' },
  { symbol: 'LRCX', name: 'Lam Research Corporation', sector: 'Technology' },
  { symbol: 'KLAC', name: 'KLA Corporation', sector: 'Technology' },
  { symbol: 'MRVL', name: 'Marvell Technology Inc.', sector: 'Technology' },
  { symbol: 'ON', name: 'ON Semiconductor Corp', sector: 'Technology' },
  { symbol: 'ARM', name: 'Arm Holdings plc', sector: 'Technology' },

  // Finance
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'Finance' },
  { symbol: 'V', name: 'Visa Inc.', sector: 'Finance' },
  { symbol: 'MA', name: 'Mastercard Inc.', sector: 'Finance' },
  { symbol: 'BAC', name: 'Bank of America Corp', sector: 'Finance' },
  { symbol: 'WFC', name: 'Wells Fargo & Company', sector: 'Finance' },
  { symbol: 'GS', name: 'Goldman Sachs Group Inc.', sector: 'Finance' },
  { symbol: 'MS', name: 'Morgan Stanley', sector: 'Finance' },
  { symbol: 'C', name: 'Citigroup Inc.', sector: 'Finance' },
  { symbol: 'AXP', name: 'American Express Company', sector: 'Finance' },
  { symbol: 'BLK', name: 'BlackRock Inc.', sector: 'Finance' },
  { symbol: 'SCHW', name: 'Charles Schwab Corporation', sector: 'Finance' },
  { symbol: 'COF', name: 'Capital One Financial Corp', sector: 'Finance' },
  { symbol: 'USB', name: 'U.S. Bancorp', sector: 'Finance' },
  { symbol: 'PNC', name: 'PNC Financial Services', sector: 'Finance' },
  { symbol: 'TFC', name: 'Truist Financial Corporation', sector: 'Finance' },

  // Healthcare
  { symbol: 'UNH', name: 'UnitedHealth Group Inc.', sector: 'Healthcare' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare' },
  { symbol: 'LLY', name: 'Eli Lilly and Company', sector: 'Healthcare' },
  { symbol: 'PFE', name: 'Pfizer Inc.', sector: 'Healthcare' },
  { symbol: 'ABBV', name: 'AbbVie Inc.', sector: 'Healthcare' },
  { symbol: 'MRK', name: 'Merck & Co. Inc.', sector: 'Healthcare' },
  { symbol: 'TMO', name: 'Thermo Fisher Scientific', sector: 'Healthcare' },
  { symbol: 'ABT', name: 'Abbott Laboratories', sector: 'Healthcare' },
  { symbol: 'DHR', name: 'Danaher Corporation', sector: 'Healthcare' },
  { symbol: 'BMY', name: 'Bristol-Myers Squibb', sector: 'Healthcare' },
  { symbol: 'AMGN', name: 'Amgen Inc.', sector: 'Healthcare' },
  { symbol: 'GILD', name: 'Gilead Sciences Inc.', sector: 'Healthcare' },
  { symbol: 'VRTX', name: 'Vertex Pharmaceuticals', sector: 'Healthcare' },
  { symbol: 'REGN', name: 'Regeneron Pharmaceuticals', sector: 'Healthcare' },
  { symbol: 'MRNA', name: 'Moderna Inc.', sector: 'Healthcare' },
  { symbol: 'ISRG', name: 'Intuitive Surgical Inc.', sector: 'Healthcare' },
  { symbol: 'CVS', name: 'CVS Health Corporation', sector: 'Healthcare' },
  { symbol: 'ELV', name: 'Elevance Health Inc.', sector: 'Healthcare' },
  { symbol: 'CI', name: 'The Cigna Group', sector: 'Healthcare' },
  { symbol: 'HUM', name: 'Humana Inc.', sector: 'Healthcare' },

  // Consumer
  { symbol: 'WMT', name: 'Walmart Inc.', sector: 'Consumer' },
  { symbol: 'HD', name: 'The Home Depot Inc.', sector: 'Consumer' },
  { symbol: 'PG', name: 'Procter & Gamble Co.', sector: 'Consumer' },
  { symbol: 'KO', name: 'The Coca-Cola Company', sector: 'Consumer' },
  { symbol: 'PEP', name: 'PepsiCo Inc.', sector: 'Consumer' },
  { symbol: 'COST', name: 'Costco Wholesale Corp', sector: 'Consumer' },
  { symbol: 'MCD', name: "McDonald's Corporation", sector: 'Consumer' },
  { symbol: 'NKE', name: 'Nike Inc.', sector: 'Consumer' },
  { symbol: 'SBUX', name: 'Starbucks Corporation', sector: 'Consumer' },
  { symbol: 'TGT', name: 'Target Corporation', sector: 'Consumer' },
  { symbol: 'LOW', name: "Lowe's Companies Inc.", sector: 'Consumer' },
  { symbol: 'DIS', name: 'The Walt Disney Company', sector: 'Consumer' },
  { symbol: 'NFLX', name: 'Netflix Inc.', sector: 'Consumer' },
  { symbol: 'CMCSA', name: 'Comcast Corporation', sector: 'Consumer' },
  { symbol: 'BKNG', name: 'Booking Holdings Inc.', sector: 'Consumer' },
  { symbol: 'ABNB', name: 'Airbnb Inc.', sector: 'Consumer' },
  { symbol: 'MAR', name: 'Marriott International', sector: 'Consumer' },
  { symbol: 'YUM', name: 'Yum! Brands Inc.', sector: 'Consumer' },
  { symbol: 'CMG', name: 'Chipotle Mexican Grill', sector: 'Consumer' },
  { symbol: 'LULU', name: 'Lululemon Athletica', sector: 'Consumer' },
  { symbol: 'ROST', name: 'Ross Stores Inc.', sector: 'Consumer' },
  { symbol: 'TJX', name: 'TJX Companies Inc.', sector: 'Consumer' },
  { symbol: 'DG', name: 'Dollar General Corp', sector: 'Consumer' },
  { symbol: 'DLTR', name: 'Dollar Tree Inc.', sector: 'Consumer' },

  // Industrial
  { symbol: 'CAT', name: 'Caterpillar Inc.', sector: 'Industrial' },
  { symbol: 'DE', name: 'Deere & Company', sector: 'Industrial' },
  { symbol: 'UPS', name: 'United Parcel Service', sector: 'Industrial' },
  { symbol: 'FDX', name: 'FedEx Corporation', sector: 'Industrial' },
  { symbol: 'BA', name: 'Boeing Company', sector: 'Industrial' },
  { symbol: 'HON', name: 'Honeywell International', sector: 'Industrial' },
  { symbol: 'GE', name: 'General Electric Company', sector: 'Industrial' },
  { symbol: 'RTX', name: 'RTX Corporation', sector: 'Industrial' },
  { symbol: 'LMT', name: 'Lockheed Martin Corp', sector: 'Industrial' },
  { symbol: 'NOC', name: 'Northrop Grumman Corp', sector: 'Industrial' },
  { symbol: 'GD', name: 'General Dynamics Corp', sector: 'Industrial' },
  { symbol: 'MMM', name: '3M Company', sector: 'Industrial' },
  { symbol: 'EMR', name: 'Emerson Electric Co.', sector: 'Industrial' },
  { symbol: 'ETN', name: 'Eaton Corporation', sector: 'Industrial' },
  { symbol: 'ITW', name: 'Illinois Tool Works', sector: 'Industrial' },

  // Energy
  { symbol: 'XOM', name: 'Exxon Mobil Corporation', sector: 'Energy' },
  { symbol: 'CVX', name: 'Chevron Corporation', sector: 'Energy' },
  { symbol: 'COP', name: 'ConocoPhillips', sector: 'Energy' },
  { symbol: 'SLB', name: 'Schlumberger Limited', sector: 'Energy' },
  { symbol: 'EOG', name: 'EOG Resources Inc.', sector: 'Energy' },
  { symbol: 'OXY', name: 'Occidental Petroleum', sector: 'Energy' },
  { symbol: 'PSX', name: 'Phillips 66', sector: 'Energy' },
  { symbol: 'VLO', name: 'Valero Energy Corp', sector: 'Energy' },
  { symbol: 'MPC', name: 'Marathon Petroleum Corp', sector: 'Energy' },
  { symbol: 'HAL', name: 'Halliburton Company', sector: 'Energy' },

  // Communication
  { symbol: 'T', name: 'AT&T Inc.', sector: 'Communication' },
  { symbol: 'VZ', name: 'Verizon Communications', sector: 'Communication' },
  { symbol: 'TMUS', name: 'T-Mobile US Inc.', sector: 'Communication' },
  { symbol: 'CHTR', name: 'Charter Communications', sector: 'Communication' },

  // Real Estate & Utilities
  { symbol: 'AMT', name: 'American Tower Corp', sector: 'Real Estate' },
  { symbol: 'PLD', name: 'Prologis Inc.', sector: 'Real Estate' },
  { symbol: 'CCI', name: 'Crown Castle Inc.', sector: 'Real Estate' },
  { symbol: 'EQIX', name: 'Equinix Inc.', sector: 'Real Estate' },
  { symbol: 'SPG', name: 'Simon Property Group', sector: 'Real Estate' },
  { symbol: 'NEE', name: 'NextEra Energy Inc.', sector: 'Utilities' },
  { symbol: 'DUK', name: 'Duke Energy Corporation', sector: 'Utilities' },
  { symbol: 'SO', name: 'Southern Company', sector: 'Utilities' },

  // Materials
  { symbol: 'LIN', name: 'Linde plc', sector: 'Materials' },
  { symbol: 'APD', name: 'Air Products & Chemicals', sector: 'Materials' },
  { symbol: 'ECL', name: 'Ecolab Inc.', sector: 'Materials' },
  { symbol: 'SHW', name: 'Sherwin-Williams Company', sector: 'Materials' },
  { symbol: 'FCX', name: 'Freeport-McMoRan Inc.', sector: 'Materials' },
  { symbol: 'NEM', name: 'Newmont Corporation', sector: 'Materials' },
  { symbol: 'NUE', name: 'Nucor Corporation', sector: 'Materials' },

  // ETFs
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', sector: 'ETF' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', sector: 'ETF' },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF', sector: 'ETF' },
  { symbol: 'DIA', name: 'SPDR Dow Jones Industrial', sector: 'ETF' },
  { symbol: 'VTI', name: 'Vanguard Total Stock Market', sector: 'ETF' },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', sector: 'ETF' },
  { symbol: 'ARKK', name: 'ARK Innovation ETF', sector: 'ETF' },
  { symbol: 'XLF', name: 'Financial Select Sector SPDR', sector: 'ETF' },
  { symbol: 'XLE', name: 'Energy Select Sector SPDR', sector: 'ETF' },
  { symbol: 'XLK', name: 'Technology Select Sector SPDR', sector: 'ETF' },
  { symbol: 'XLV', name: 'Health Care Select Sector SPDR', sector: 'ETF' },
  { symbol: 'XLI', name: 'Industrial Select Sector SPDR', sector: 'ETF' },
  { symbol: 'XLY', name: 'Consumer Discretionary SPDR', sector: 'ETF' },
  { symbol: 'XLP', name: 'Consumer Staples Select SPDR', sector: 'ETF' },
  { symbol: 'SOXX', name: 'iShares Semiconductor ETF', sector: 'ETF' },
  { symbol: 'SMH', name: 'VanEck Semiconductor ETF', sector: 'ETF' },
];

// Search stocks by symbol or name
export function searchStocks(query: string, limit: number = 10): StockInfo[] {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const normalizedQuery = query.toUpperCase().trim();

  // First, find exact symbol matches
  const exactMatches = US_STOCKS.filter(
    (stock) => stock.symbol === normalizedQuery
  );

  // Then, find stocks that start with the query (symbol)
  const symbolStartsWith = US_STOCKS.filter(
    (stock) =>
      stock.symbol.startsWith(normalizedQuery) &&
      stock.symbol !== normalizedQuery
  );

  // Then, find stocks where name contains the query
  const nameContains = US_STOCKS.filter(
    (stock) =>
      stock.name.toUpperCase().includes(normalizedQuery) &&
      !stock.symbol.startsWith(normalizedQuery)
  );

  const results = [...exactMatches, ...symbolStartsWith, ...nameContains];
  const shouldIncludeCustom =
    results.length === 0 &&
    normalizedQuery.length >= 2 &&
    SYMBOL_PATTERN.test(normalizedQuery);

  if (shouldIncludeCustom) {
    results.unshift({
      symbol: normalizedQuery,
      name: 'Custom Symbol',
      sector: 'Custom',
    });
  }

  // Combine and limit results
  return results.slice(0, limit);
}
