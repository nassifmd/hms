/**
 * Date utility functions
 */

const moment = require('moment');

/**
 * Format date
 */
const formatDate = (date, format = 'YYYY-MM-DD') => {
  if (!date) return null;
  return moment(date).format(format);
};

/**
 * Format datetime
 */
const formatDateTime = (date, format = 'YYYY-MM-DD HH:mm:ss') => {
  if (!date) return null;
  return moment(date).format(format);
};

/**
 * Parse date string
 */
const parseDate = (dateString, format = 'YYYY-MM-DD') => {
  return moment(dateString, format).toDate();
};

/**
 * Get current date
 */
const getCurrentDate = () => {
  return moment().startOf('day').toDate();
};

/**
 * Get current datetime
 */
const getCurrentDateTime = () => {
  return moment().toDate();
};

/**
 * Add days to date
 */
const addDays = (date, days) => {
  return moment(date).add(days, 'days').toDate();
};

/**
 * Subtract days from date
 */
const subtractDays = (date, days) => {
  return moment(date).subtract(days, 'days').toDate();
};

/**
 * Add months to date
 */
const addMonths = (date, months) => {
  return moment(date).add(months, 'months').toDate();
};

/**
 * Subtract months from date
 */
const subtractMonths = (date, months) => {
  return moment(date).subtract(months, 'months').toDate();
};

/**
 * Add years to date
 */
const addYears = (date, years) => {
  return moment(date).add(years, 'years').toDate();
};

/**
 * Subtract years from date
 */
const subtractYears = (date, years) => {
  return moment(date).subtract(years, 'years').toDate();
};

/**
 * Get start of day
 */
const startOfDay = (date) => {
  return moment(date).startOf('day').toDate();
};

/**
 * Get end of day
 */
const endOfDay = (date) => {
  return moment(date).endOf('day').toDate();
};

/**
 * Get start of week
 */
const startOfWeek = (date) => {
  return moment(date).startOf('week').toDate();
};

/**
 * Get end of week
 */
const endOfWeek = (date) => {
  return moment(date).endOf('week').toDate();
};

/**
 * Get start of month
 */
const startOfMonth = (date) => {
  return moment(date).startOf('month').toDate();
};

/**
 * Get end of month
 */
const endOfMonth = (date) => {
  return moment(date).endOf('month').toDate();
};

/**
 * Get start of year
 */
const startOfYear = (date) => {
  return moment(date).startOf('year').toDate();
};

/**
 * Get end of year
 */
const endOfYear = (date) => {
  return moment(date).endOf('year').toDate();
};

/**
 * Get difference in days
 */
const diffInDays = (date1, date2) => {
  return moment(date1).diff(moment(date2), 'days');
};

/**
 * Get difference in hours
 */
const diffInHours = (date1, date2) => {
  return moment(date1).diff(moment(date2), 'hours');
};

/**
 * Get difference in minutes
 */
const diffInMinutes = (date1, date2) => {
  return moment(date1).diff(moment(date2), 'minutes');
};

/**
 * Get difference in seconds
 */
const diffInSeconds = (date1, date2) => {
  return moment(date1).diff(moment(date2), 'seconds');
};

/**
 * Get difference in months
 */
const diffInMonths = (date1, date2) => {
  return moment(date1).diff(moment(date2), 'months');
};

/**
 * Get difference in years
 */
const diffInYears = (date1, date2) => {
  return moment(date1).diff(moment(date2), 'years');
};

/**
 * Check if date is before
 */
const isBefore = (date1, date2) => {
  return moment(date1).isBefore(date2);
};

/**
 * Check if date is after
 */
const isAfter = (date1, date2) => {
  return moment(date1).isAfter(date2);
};

/**
 * Check if date is between
 */
const isBetween = (date, start, end) => {
  return moment(date).isBetween(start, end);
};

/**
 * Check if date is same day
 */
const isSameDay = (date1, date2) => {
  return moment(date1).isSame(date2, 'day');
};

/**
 * Check if date is same month
 */
const isSameMonth = (date1, date2) => {
  return moment(date1).isSame(date2, 'month');
};

/**
 * Check if date is same year
 */
const isSameYear = (date1, date2) => {
  return moment(date1).isSame(date2, 'year');
};

/**
 * Check if date is today
 */
const isToday = (date) => {
  return moment(date).isSame(moment(), 'day');
};

/**
 * Check if date is tomorrow
 */
const isTomorrow = (date) => {
  return moment(date).isSame(moment().add(1, 'day'), 'day');
};

/**
 * Check if date is yesterday
 */
const isYesterday = (date) => {
  return moment(date).isSame(moment().subtract(1, 'day'), 'day');
};

/**
 * Check if date is in the past
 */
const isPast = (date) => {
  return moment(date).isBefore(moment());
};

/**
 * Check if date is in the future
 */
const isFuture = (date) => {
  return moment(date).isAfter(moment());
};

/**
 * Check if date is weekend
 */
const isWeekend = (date) => {
  const day = moment(date).day();
  return day === 0 || day === 6;
};

/**
 * Check if date is weekday
 */
const isWeekday = (date) => {
  return !isWeekend(date);
};

/**
 * Get age from date of birth
 */
const getAge = (dateOfBirth, asOf = new Date()) => {
  return moment(asOf).diff(moment(dateOfBirth), 'years');
};

/**
 * Get age in years, months, days
 */
const getAgePrecise = (dateOfBirth, asOf = new Date()) => {
  const dob = moment(dateOfBirth);
  const now = moment(asOf);
  
  const years = now.diff(dob, 'years');
  dob.add(years, 'years');
  
  const months = now.diff(dob, 'months');
  dob.add(months, 'months');
  
  const days = now.diff(dob, 'days');
  
  return { years, months, days };
};

/**
 * Get date range
 */
const getDateRange = (startDate, endDate) => {
  const dates = [];
  let currentDate = moment(startDate);
  const lastDate = moment(endDate);
  
  while (currentDate <= lastDate) {
    dates.push(currentDate.toDate());
    currentDate = currentDate.add(1, 'day');
  }
  
  return dates;
};

/**
 * Get month dates
 */
const getMonthDates = (year, month) => {
  const start = moment([year, month - 1]).startOf('month');
  const end = moment([year, month - 1]).endOf('month');
  return getDateRange(start.toDate(), end.toDate());
};

/**
 * Get week dates
 */
const getWeekDates = (date) => {
  const start = moment(date).startOf('week');
  const end = moment(date).endOf('week');
  return getDateRange(start.toDate(), end.toDate());
};

/**
 * Get quarter dates
 */
const getQuarterDates = (year, quarter) => {
  const start = moment([year, (quarter - 1) * 3]).startOf('quarter');
  const end = moment([year, (quarter - 1) * 3]).endOf('quarter');
  return getDateRange(start.toDate(), end.toDate());
};

/**
 * Get year dates
 */
const getYearDates = (year) => {
  const start = moment([year, 0]).startOf('year');
  const end = moment([year, 0]).endOf('year');
  return getDateRange(start.toDate(), end.toDate());
};

/**
 * Get business days between dates
 */
const getBusinessDays = (startDate, endDate) => {
  let count = 0;
  let currentDate = moment(startDate);
  const lastDate = moment(endDate);
  
  while (currentDate <= lastDate) {
    if (isWeekday(currentDate.toDate())) {
      count++;
    }
    currentDate = currentDate.add(1, 'day');
  }
  
  return count;
};

/**
 * Add business days
 */
const addBusinessDays = (date, days) => {
  let result = moment(date);
  let added = 0;
  
  while (added < days) {
    result = result.add(1, 'day');
    if (isWeekday(result.toDate())) {
      added++;
    }
  }
  
  return result.toDate();
};

/**
 * Get next business day
 */
const getNextBusinessDay = (date) => {
  let next = moment(date).add(1, 'day');
  while (isWeekend(next.toDate())) {
    next = next.add(1, 'day');
  }
  return next.toDate();
};

/**
 * Get previous business day
 */
const getPreviousBusinessDay = (date) => {
  let prev = moment(date).subtract(1, 'day');
  while (isWeekend(prev.toDate())) {
    prev = prev.subtract(1, 'day');
  }
  return prev.toDate();
};

/**
 * Get fiscal year
 */
const getFiscalYear = (date, startMonth = 1) => {
  const year = moment(date).year();
  const month = moment(date).month() + 1;
  
  if (month >= startMonth) {
    return `${year}-${year + 1}`;
  } else {
    return `${year - 1}-${year}`;
  }
};

/**
 * Get quarter
 */
const getQuarter = (date) => {
  return moment(date).quarter();
};

/**
 * Get week number
 */
const getWeekNumber = (date) => {
  return moment(date).isoWeek();
};

/**
 * Get day of year
 */
const getDayOfYear = (date) => {
  return moment(date).dayOfYear();
};

/**
 * Get time ago
 */
const timeAgo = (date) => {
  return moment(date).fromNow();
};

/**
 * Get time remaining
 */
const timeRemaining = (date) => {
  return moment(date).toNow(true);
};

/**
 * Is leap year
 */
const isLeapYear = (year) => {
  return moment([year]).isLeapYear();
};

/**
 * Get days in month
 */
const getDaysInMonth = (year, month) => {
  return moment([year, month - 1]).daysInMonth();
};

/**
 * Get timestamp
 */
const getTimestamp = (date) => {
  return moment(date).valueOf();
};

/**
 * Get ISO string
 */
const toISOString = (date) => {
  return moment(date).toISOString();
};

/**
 * Get UTC string
 */
const toUTCString = (date) => {
  return moment(date).utc().format();
};

/**
 * Get local string
 */
const toLocalString = (date) => {
  return moment(date).local().format();
};

/**
 * Get timezone offset
 */
const getTimezoneOffset = (date) => {
  return moment(date).utcOffset();
};

/**
 * Set timezone
 */
const setTimezone = (date, timezone) => {
  return moment(date).tz(timezone).toDate();
};

module.exports = {
  formatDate,
  formatDateTime,
  parseDate,
  getCurrentDate,
  getCurrentDateTime,
  addDays,
  subtractDays,
  addMonths,
  subtractMonths,
  addYears,
  subtractYears,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  diffInDays,
  diffInHours,
  diffInMinutes,
  diffInSeconds,
  diffInMonths,
  diffInYears,
  isBefore,
  isAfter,
  isBetween,
  isSameDay,
  isSameMonth,
  isSameYear,
  isToday,
  isTomorrow,
  isYesterday,
  isPast,
  isFuture,
  isWeekend,
  isWeekday,
  getAge,
  getAgePrecise,
  getDateRange,
  getMonthDates,
  getWeekDates,
  getQuarterDates,
  getYearDates,
  getBusinessDays,
  addBusinessDays,
  getNextBusinessDay,
  getPreviousBusinessDay,
  getFiscalYear,
  getQuarter,
  getWeekNumber,
  getDayOfYear,
  timeAgo,
  timeRemaining,
  isLeapYear,
  getDaysInMonth,
  getTimestamp,
  toISOString,
  toUTCString,
  toLocalString,
  getTimezoneOffset,
  setTimezone
};