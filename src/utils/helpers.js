import { randomBytes } from 'crypto';

export function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Remove confusing chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function parseDateRange(dateString) {
  // Simple date parsing for MVP
  // Examples: "March 15-22", "march 15-22", "April 5-12"
  const match = dateString.match(/(\w+)\s+(\d+)-(\d+)/i);
  if (match) {
    const [_, month, startDay, endDay] = match;
    const year = new Date().getFullYear() + (month.toLowerCase() === 'december' ? 0 : 1);
    
    // Case-insensitive month parsing
    const monthMap = {
      'january': 0, 'february': 1, 'march': 2, 'april': 3,
      'may': 4, 'june': 5, 'july': 6, 'august': 7,
      'september': 8, 'october': 9, 'november': 10, 'december': 11
    };
    
    const monthLower = month.toLowerCase();
    const monthIndex = monthMap[monthLower];
    if (monthIndex !== undefined) {
      return {
        start: new Date(year, monthIndex, parseInt(startDay)),
        end: new Date(year, monthIndex, parseInt(endDay))
      };
    }
  }
  
  return { start: null, end: null };
}


