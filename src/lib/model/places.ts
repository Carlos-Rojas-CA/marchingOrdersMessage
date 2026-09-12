/**
 * Cities that are not their own IANA time zone.
 *
 * The zone database names about 400 zones, and most cities are not among them
 * — there is no `Europe/Barcelona` or `Asia/Kyoto`. A traveller neither knows
 * nor should care, so the places they actually type are mapped here, along
 * with the airport codes a ticket prints.
 *
 * Deliberately not exhaustive. It covers the places these trips go; anything
 * missing falls through to the zone list, and failing that to the next rule in
 * the resolution chain. A wrong guess is worse than no guess.
 */

export interface PlaceSeed {
  name: string;
  country: string;
  timeZone: string;
  /** Airport codes and local-language spellings that should also match. */
  aliases?: string[];
}

export const PLACES: PlaceSeed[] = [
  // — Italy —
  { name: 'Rome', country: 'Italy', timeZone: 'Europe/Rome', aliases: ['Roma', 'FCO', 'CIA'] },
  { name: 'Florence', country: 'Italy', timeZone: 'Europe/Rome', aliases: ['Firenze', 'FLR'] },
  { name: 'Venice', country: 'Italy', timeZone: 'Europe/Rome', aliases: ['Venezia', 'VCE'] },
  { name: 'Milan', country: 'Italy', timeZone: 'Europe/Rome', aliases: ['Milano', 'MXP', 'LIN'] },
  { name: 'Naples', country: 'Italy', timeZone: 'Europe/Rome', aliases: ['Napoli', 'NAP'] },
  { name: 'Bologna', country: 'Italy', timeZone: 'Europe/Rome', aliases: ['BLQ'] },
  { name: 'Pisa', country: 'Italy', timeZone: 'Europe/Rome', aliases: ['PSA'] },

  // — Spain —
  { name: 'Barcelona', country: 'Spain', timeZone: 'Europe/Madrid', aliases: ['BCN'] },
  { name: 'Madrid', country: 'Spain', timeZone: 'Europe/Madrid', aliases: ['MAD'] },
  { name: 'Seville', country: 'Spain', timeZone: 'Europe/Madrid', aliases: ['Sevilla', 'SVQ'] },
  { name: 'Valencia', country: 'Spain', timeZone: 'Europe/Madrid', aliases: ['VLC'] },
  { name: 'Granada', country: 'Spain', timeZone: 'Europe/Madrid', aliases: ['GRX'] },
  { name: 'Bilbao', country: 'Spain', timeZone: 'Europe/Madrid', aliases: ['BIO'] },

  // — France —
  { name: 'Paris', country: 'France', timeZone: 'Europe/Paris', aliases: ['CDG', 'ORY'] },
  { name: 'Nice', country: 'France', timeZone: 'Europe/Paris', aliases: ['NCE'] },
  { name: 'Lyon', country: 'France', timeZone: 'Europe/Paris', aliases: ['LYS'] },
  { name: 'Marseille', country: 'France', timeZone: 'Europe/Paris', aliases: ['MRS'] },
  { name: 'Bordeaux', country: 'France', timeZone: 'Europe/Paris', aliases: ['BOD'] },

  // — Germany, Austria, Switzerland —
  { name: 'Berlin', country: 'Germany', timeZone: 'Europe/Berlin', aliases: ['BER'] },
  { name: 'Munich', country: 'Germany', timeZone: 'Europe/Berlin', aliases: ['München', 'Munchen', 'MUC'] },
  { name: 'Frankfurt', country: 'Germany', timeZone: 'Europe/Berlin', aliases: ['FRA'] },
  { name: 'Hamburg', country: 'Germany', timeZone: 'Europe/Berlin', aliases: ['HAM'] },
  { name: 'Cologne', country: 'Germany', timeZone: 'Europe/Berlin', aliases: ['Köln', 'Koln', 'CGN'] },
  { name: 'Vienna', country: 'Austria', timeZone: 'Europe/Vienna', aliases: ['Wien', 'VIE'] },
  { name: 'Zurich', country: 'Switzerland', timeZone: 'Europe/Zurich', aliases: ['Zürich', 'ZRH'] },
  { name: 'Geneva', country: 'Switzerland', timeZone: 'Europe/Zurich', aliases: ['Genève', 'GVA'] },

  // — Rest of Europe —
  { name: 'London', country: 'United Kingdom', timeZone: 'Europe/London', aliases: ['LHR', 'LGW', 'STN'] },
  { name: 'Edinburgh', country: 'United Kingdom', timeZone: 'Europe/London', aliases: ['EDI'] },
  { name: 'Dublin', country: 'Ireland', timeZone: 'Europe/Dublin', aliases: ['DUB'] },
  { name: 'Amsterdam', country: 'Netherlands', timeZone: 'Europe/Amsterdam', aliases: ['AMS'] },
  { name: 'Brussels', country: 'Belgium', timeZone: 'Europe/Brussels', aliases: ['Bruxelles', 'BRU'] },
  { name: 'Lisbon', country: 'Portugal', timeZone: 'Europe/Lisbon', aliases: ['Lisboa', 'LIS'] },
  { name: 'Porto', country: 'Portugal', timeZone: 'Europe/Lisbon', aliases: ['OPO'] },
  { name: 'Prague', country: 'Czechia', timeZone: 'Europe/Prague', aliases: ['Praha', 'PRG'] },
  { name: 'Budapest', country: 'Hungary', timeZone: 'Europe/Budapest', aliases: ['BUD'] },
  { name: 'Copenhagen', country: 'Denmark', timeZone: 'Europe/Copenhagen', aliases: ['CPH'] },
  { name: 'Stockholm', country: 'Sweden', timeZone: 'Europe/Stockholm', aliases: ['ARN'] },
  { name: 'Oslo', country: 'Norway', timeZone: 'Europe/Oslo', aliases: ['OSL'] },
  { name: 'Reykjavik', country: 'Iceland', timeZone: 'Atlantic/Reykjavik', aliases: ['Reykjavík', 'KEF'] },
  { name: 'Athens', country: 'Greece', timeZone: 'Europe/Athens', aliases: ['Athina', 'ATH'] },
  { name: 'Santorini', country: 'Greece', timeZone: 'Europe/Athens', aliases: ['Thira', 'JTR'] },
  { name: 'Istanbul', country: 'Türkiye', timeZone: 'Europe/Istanbul', aliases: ['IST'] },
  { name: 'Warsaw', country: 'Poland', timeZone: 'Europe/Warsaw', aliases: ['Warszawa', 'WAW'] },
  { name: 'Kraków', country: 'Poland', timeZone: 'Europe/Warsaw', aliases: ['Krakow', 'KRK'] },
  { name: 'Zagreb', country: 'Croatia', timeZone: 'Europe/Zagreb', aliases: ['ZAG'] },
  { name: 'Split', country: 'Croatia', timeZone: 'Europe/Zagreb', aliases: ['SPU'] },

  // — Japan —
  { name: 'Tokyo', country: 'Japan', timeZone: 'Asia/Tokyo', aliases: ['HND', 'NRT'] },
  { name: 'Kyoto', country: 'Japan', timeZone: 'Asia/Tokyo' },
  { name: 'Osaka', country: 'Japan', timeZone: 'Asia/Tokyo', aliases: ['KIX', 'ITM'] },
  { name: 'Nara', country: 'Japan', timeZone: 'Asia/Tokyo' },
  { name: 'Fukuoka', country: 'Japan', timeZone: 'Asia/Tokyo', aliases: ['FUK'] },
  { name: 'Sapporo', country: 'Japan', timeZone: 'Asia/Tokyo', aliases: ['CTS'] },
  { name: 'Hiroshima', country: 'Japan', timeZone: 'Asia/Tokyo', aliases: ['HIJ'] },
  { name: 'Nagoya', country: 'Japan', timeZone: 'Asia/Tokyo', aliases: ['NGO'] },

  // — Rest of Asia and Oceania —
  { name: 'Seoul', country: 'South Korea', timeZone: 'Asia/Seoul', aliases: ['ICN', 'GMP'] },
  { name: 'Taipei', country: 'Taiwan', timeZone: 'Asia/Taipei', aliases: ['TPE'] },
  { name: 'Hong Kong', country: 'Hong Kong', timeZone: 'Asia/Hong_Kong', aliases: ['HKG'] },
  { name: 'Singapore', country: 'Singapore', timeZone: 'Asia/Singapore', aliases: ['SIN'] },
  { name: 'Bangkok', country: 'Thailand', timeZone: 'Asia/Bangkok', aliases: ['BKK'] },
  { name: 'Hanoi', country: 'Vietnam', timeZone: 'Asia/Ho_Chi_Minh', aliases: ['HAN'] },
  { name: 'Bali', country: 'Indonesia', timeZone: 'Asia/Makassar', aliases: ['Denpasar', 'DPS'] },
  { name: 'Sydney', country: 'Australia', timeZone: 'Australia/Sydney', aliases: ['SYD'] },
  { name: 'Melbourne', country: 'Australia', timeZone: 'Australia/Melbourne', aliases: ['MEL'] },
  { name: 'Auckland', country: 'New Zealand', timeZone: 'Pacific/Auckland', aliases: ['AKL'] },
  { name: 'Dubai', country: 'United Arab Emirates', timeZone: 'Asia/Dubai', aliases: ['DXB'] },
  { name: 'Delhi', country: 'India', timeZone: 'Asia/Kolkata', aliases: ['New Delhi', 'DEL'] },
  { name: 'Mumbai', country: 'India', timeZone: 'Asia/Kolkata', aliases: ['BOM'] },

  // — North America —
  { name: 'San Diego', country: 'United States', timeZone: 'America/Los_Angeles', aliases: ['SAN'] },
  { name: 'Los Angeles', country: 'United States', timeZone: 'America/Los_Angeles', aliases: ['LAX'] },
  { name: 'San Francisco', country: 'United States', timeZone: 'America/Los_Angeles', aliases: ['SFO'] },
  { name: 'Seattle', country: 'United States', timeZone: 'America/Los_Angeles', aliases: ['SEA'] },
  { name: 'Las Vegas', country: 'United States', timeZone: 'America/Los_Angeles', aliases: ['LAS'] },
  { name: 'Phoenix', country: 'United States', timeZone: 'America/Phoenix', aliases: ['PHX'] },
  { name: 'Denver', country: 'United States', timeZone: 'America/Denver', aliases: ['DEN'] },
  { name: 'Chicago', country: 'United States', timeZone: 'America/Chicago', aliases: ['ORD', 'MDW'] },
  { name: 'Austin', country: 'United States', timeZone: 'America/Chicago', aliases: ['AUS'] },
  { name: 'Houston', country: 'United States', timeZone: 'America/Chicago', aliases: ['IAH', 'HOU'] },
  { name: 'New York', country: 'United States', timeZone: 'America/New_York', aliases: ['NYC', 'JFK', 'LGA', 'EWR'] },
  { name: 'Boston', country: 'United States', timeZone: 'America/New_York', aliases: ['BOS'] },
  { name: 'Washington', country: 'United States', timeZone: 'America/New_York', aliases: ['DCA', 'IAD'] },
  { name: 'Miami', country: 'United States', timeZone: 'America/New_York', aliases: ['MIA'] },
  { name: 'Honolulu', country: 'United States', timeZone: 'Pacific/Honolulu', aliases: ['HNL'] },
  { name: 'Toronto', country: 'Canada', timeZone: 'America/Toronto', aliases: ['YYZ'] },
  { name: 'Vancouver', country: 'Canada', timeZone: 'America/Vancouver', aliases: ['YVR'] },
  { name: 'Montreal', country: 'Canada', timeZone: 'America/Toronto', aliases: ['Montréal', 'YUL'] },
  { name: 'Mexico City', country: 'Mexico', timeZone: 'America/Mexico_City', aliases: ['Ciudad de México', 'MEX'] },
  { name: 'Cancún', country: 'Mexico', timeZone: 'America/Cancun', aliases: ['Cancun', 'CUN'] },
  { name: 'Guadalajara', country: 'Mexico', timeZone: 'America/Mexico_City', aliases: ['GDL'] },
  { name: 'Tijuana', country: 'Mexico', timeZone: 'America/Tijuana', aliases: ['TIJ'] },

  // — South America and Africa —
  { name: 'Buenos Aires', country: 'Argentina', timeZone: 'America/Argentina/Buenos_Aires', aliases: ['EZE'] },
  { name: 'Rio de Janeiro', country: 'Brazil', timeZone: 'America/Sao_Paulo', aliases: ['GIG'] },
  { name: 'São Paulo', country: 'Brazil', timeZone: 'America/Sao_Paulo', aliases: ['Sao Paulo', 'GRU'] },
  { name: 'Lima', country: 'Peru', timeZone: 'America/Lima', aliases: ['LIM'] },
  { name: 'Cusco', country: 'Peru', timeZone: 'America/Lima', aliases: ['Cuzco', 'CUZ'] },
  { name: 'Bogotá', country: 'Colombia', timeZone: 'America/Bogota', aliases: ['Bogota', 'BOG'] },
  { name: 'Santiago', country: 'Chile', timeZone: 'America/Santiago', aliases: ['SCL'] },
  { name: 'Cape Town', country: 'South Africa', timeZone: 'Africa/Johannesburg', aliases: ['CPT'] },
  { name: 'Johannesburg', country: 'South Africa', timeZone: 'Africa/Johannesburg', aliases: ['JNB'] },
  { name: 'Cairo', country: 'Egypt', timeZone: 'Africa/Cairo', aliases: ['CAI'] },
  { name: 'Marrakesh', country: 'Morocco', timeZone: 'Africa/Casablanca', aliases: ['Marrakech', 'RAK'] },
  { name: 'Nairobi', country: 'Kenya', timeZone: 'Africa/Nairobi', aliases: ['NBO'] },
];
