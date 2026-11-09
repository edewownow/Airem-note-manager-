/**
 * Years are read the way people say them: "June 12, 1898" is "June 12, eighteen ninety-eight",
 * not "one thousand eight hundred ninety-eight". Pure text in, text out — applied once, right
 * before anything is spoken, so the rules' answers and Gemma's sentences both get it.
 * Only a number that is clearly a year is changed: after a month, or after a word like in / since /
 * year, and never when a unit follows ("1500 dollars" stays a count).
 */
const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function below100(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  return n % 10 ? `${t}-${ONES[n % 10]}` : t;
}

/** 1898 → "eighteen ninety-eight", 1905 → "nineteen oh five", 1900 → "nineteen hundred", 2007 → "two thousand seven". */
export function yearWords(y: number): string {
  if (y >= 2000 && y <= 2009) return y === 2000 ? 'two thousand' : `two thousand ${ONES[y - 2000]}`;
  const hi = Math.floor(y / 100);
  const lo = y % 100;
  if (lo === 0) return `${below100(hi)} hundred`;
  if (lo < 10) return `${below100(hi)} oh ${ONES[lo]}`;
  return `${below100(hi)} ${below100(lo)}`;
}

const MONTHS = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;
const CUE = '(?:in|of|since|until|till|by|from|during|before|after|around|circa|year|born|died|back in|dated)';
const UNIT = '(?:dollars?|euros?|usd|eur|people|items?|steps?|miles?|km|kilometers?|meters?|pounds?|calories|words|%|percent|mg|kg|gb|mb|ml)';

const AFTER_MONTH = new RegExp(String.raw`\b(${MONTHS}\s+(?:\d{1,2}(?:st|nd|rd|th)?\s*,?\s*)?)(1[0-9]{3}|20[0-9]{2})\b(?![\d,.]*\s*${UNIT})`, 'gi');
const AFTER_CUE = new RegExp(String.raw`\b(${CUE}\s+)(1[0-9]{3}|20[0-9]{2})\b(?![\d,.]*\s*${UNIT})`, 'gi');
const DAY_MONTH_YEAR = new RegExp(String.raw`\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?${MONTHS}\s*,?\s*)(1[0-9]{3}|20[0-9]{2})\b(?![\d,.]*\s*${UNIT})`, 'gi');

export function sayYears(text: string): string {
  const swap = (_m: string, lead: string, year: string) => `${lead}${yearWords(Number(year))}`;
  return text.replace(AFTER_MONTH, swap).replace(DAY_MONTH_YEAR, swap).replace(AFTER_CUE, swap);
}
