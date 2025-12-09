// Date overlap algorithm for finding common date windows

export function findOverlappingDates(availabilities) {
  if (!availabilities || availabilities.length === 0) {
    return [];
  }

  // Filter out flexible people - they work with anything
  const constrained = availabilities.filter(a => !a.is_flexible && a.start_date && a.end_date);

  // If everyone is flexible, suggest common trip lengths
  if (constrained.length === 0) {
    return generateDefaultOptions();
  }

  // Convert to Date objects for comparison
  const dateRanges = constrained.map(a => ({
    start: new Date(a.start_date),
    end: new Date(a.end_date),
  }));

  // Find the overlap window
  const latestStart = new Date(Math.max(...dateRanges.map(r => r.start.getTime())));
  const earliestEnd = new Date(Math.min(...dateRanges.map(r => r.end.getTime())));

  // Check if there's any overlap
  if (latestStart > earliestEnd) {
    // No overlap - return empty or suggest compromises
    return suggestCompromises(dateRanges);
  }

  // Generate 7-day windows within the overlap
  const options = [];
  const oneWeek = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  let current = new Date(latestStart);

  while (current.getTime() + oneWeek <= earliestEnd.getTime()) {
    const endDate = new Date(current.getTime() + oneWeek);
    options.push({
      start: new Date(current),
      end: endDate,
      startDate: formatDate(current),
      endDate: formatDate(endDate),
      display: formatDateRange(current, endDate),
    });
    
    // Move forward by 1 day
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
  }

  // Return top 3 options (most recent first, or longest first)
  return options
    .sort((a, b) => b.start.getTime() - a.start.getTime()) // Most recent first
    .slice(0, 3);
}

function generateDefaultOptions() {
  // If everyone is flexible, suggest common trip lengths starting from next month
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 15);
  const oneWeek = 7 * 24 * 60 * 60 * 1000;

  return [
    {
      start: new Date(nextMonth),
      end: new Date(nextMonth.getTime() + oneWeek),
      startDate: formatDate(nextMonth),
      endDate: formatDate(new Date(nextMonth.getTime() + oneWeek)),
      display: formatDateRange(nextMonth, new Date(nextMonth.getTime() + oneWeek)),
    },
    {
      start: new Date(nextMonth.getTime() + 14 * 24 * 60 * 60 * 1000),
      end: new Date(nextMonth.getTime() + 14 * 24 * 60 * 60 * 1000 + oneWeek),
      startDate: formatDate(new Date(nextMonth.getTime() + 14 * 24 * 60 * 60 * 1000)),
      endDate: formatDate(new Date(nextMonth.getTime() + 14 * 24 * 60 * 60 * 1000 + oneWeek)),
      display: formatDateRange(
        new Date(nextMonth.getTime() + 14 * 24 * 60 * 60 * 1000),
        new Date(nextMonth.getTime() + 14 * 24 * 60 * 60 * 1000 + oneWeek)
      ),
    },
  ];
}

function suggestCompromises(dateRanges) {
  // Find the closest dates that could work
  const allStarts = dateRanges.map(r => r.start.getTime()).sort((a, b) => a - b);
  const allEnds = dateRanges.map(r => r.end.getTime()).sort((a, b) => a - b);

  // Suggest dates around the middle of all ranges
  const midStart = allStarts[Math.floor(allStarts.length / 2)];
  const midEnd = allEnds[Math.floor(allEnds.length / 2)];

  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const start = new Date(midStart);
  const end = new Date(start.getTime() + oneWeek);

  return [
    {
      start,
      end,
      startDate: formatDate(start),
      endDate: formatDate(end),
      display: formatDateRange(start, end),
    },
  ];
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




