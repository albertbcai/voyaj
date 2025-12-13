// Date overlap algorithm for finding common date windows
// Focus: Find when everyone can travel together, not trip length

const LARGE_WINDOW_THRESHOLD = 7; // days - split if overlap is larger than this

export function findOverlappingDates(availabilities) {
  if (!availabilities || availabilities.length === 0) {
    return [];
  }

  // Filter out flexible people - they work with anything
  const constrained = availabilities.filter(a => !a.is_flexible && a.start_date && a.end_date);

  // If everyone is flexible, suggest single default option
  if (constrained.length === 0) {
    return generateDefaultOptions();
  }

  // Convert to Date objects for comparison
  const dateRanges = constrained.map(a => ({
    start: new Date(a.start_date),
    end: new Date(a.end_date),
  }));

  // Find the overlap window: latest start → earliest end where everyone is available
  const latestStart = new Date(Math.max(...dateRanges.map(r => r.start.getTime())));
  const earliestEnd = new Date(Math.min(...dateRanges.map(r => r.end.getTime())));

  // Check if there's any overlap
  if (latestStart > earliestEnd) {
    // No overlap - return empty array (let parser handle conflict message)
    return [];
  }

  // Calculate overlap duration in days
  const overlapDays = Math.ceil((earliestEnd.getTime() - latestStart.getTime()) / (1000 * 60 * 60 * 24));

  // If overlap is reasonable (≤ 45 days), return single option
  if (overlapDays <= LARGE_WINDOW_THRESHOLD) {
    return [createDateOption(latestStart, earliestEnd)];
  }

  // If overlap is large (> 45 days), split into 2-3 reasonable chunks
  return splitLargeWindow(latestStart, earliestEnd, overlapDays);
}

function generateDefaultOptions() {
  // If everyone is flexible, suggest single default option for next month
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 15);
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const endDate = new Date(nextMonth.getTime() + oneWeek);

  return [createDateOption(nextMonth, endDate)];
}

function splitLargeWindow(start, end, totalDays) {
  // Split large overlap windows into 2-3 reasonable chunks
  // Chunks are contiguous (no gaps) and together cover the full overlap window
  const options = [];
  
  // Determine number of chunks (2 or 3) based on size
  // For 46-90 days: 2 chunks, for 90+ days: 3 chunks
  const numChunks = totalDays > 90 ? 3 : 2;
  const chunkSize = Math.floor(totalDays / numChunks);
  
  let currentStart = new Date(start);
  
  for (let i = 0; i < numChunks; i++) {
    // Calculate chunk end - for last chunk, use actual end date
    let chunkEnd;
    if (i === numChunks - 1) {
      chunkEnd = new Date(end);
    } else {
      // Calculate end by adding chunk size minus 1 day (to make chunks contiguous)
      const daysToAdd = chunkSize - 1;
      chunkEnd = new Date(currentStart.getTime() + (daysToAdd * 24 * 60 * 60 * 1000));
    }
    
    options.push(createDateOption(currentStart, chunkEnd));
    
    // Move to next chunk - start immediately after this chunk ends (contiguous)
    currentStart = new Date(chunkEnd.getTime() + (24 * 60 * 60 * 1000));
  }
  
  return options;
}

function createDateOption(start, end) {
  return {
    start: new Date(start),
    end: new Date(end),
    startDate: formatDate(start),
    endDate: formatDate(end),
    display: formatDateRange(start, end),
  };
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateRange(start, end) {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  
  const startMonth = monthNames[start.getMonth()];
  const startDay = start.getDate();
  const endMonth = monthNames[end.getMonth()];
  const endDay = end.getDate();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}`;
  } else {
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
  }
}




