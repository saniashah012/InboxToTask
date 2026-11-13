const invalid = () => { throw Object.assign(new Error('INVALID_CALENDAR_DRAFT'), {code:'INVALID_CALENDAR_DRAFT'}); };
export function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0,4)) < 1000) invalid();
  const value = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0,10) !== date) invalid();
  return value;
}

// Same wall-clock resolution as the existing ICS export: never silently choose
// a skipped/repeated DST time. Used for both event endpoints on the server.
export function calendarInstant(date, time, timeZone) {
  validDate(date);
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) invalid();
  let formatter;
  try { formatter = new Intl.DateTimeFormat('en-CA', {timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}); }
  catch { invalid(); }
  const wall = instant => {
    const p = Object.fromEntries(formatter.formatToParts(instant).map(p=>[p.type,p.value]));
    return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
  };
  const target = Date.parse(`${date}T${time}:00Z`), offsets = new Set();
  for (let h=-36;h<=36;h+=6) { const probe=target+h*3600000; offsets.add(wall(probe)-probe); }
  const matches=[...offsets].map(o=>target-o).filter(i=>wall(i)===target);
  if (matches.length!==1) invalid();
  return new Date(matches[0]);
}

export function validateCalendarDraft(doc) {
  if (!doc || Array.isArray(doc) || typeof doc !== 'object' || Object.keys(doc).some(k=>!['title','date','allDay','startTime','endDate','endTime','timeZone'].includes(k))
    || typeof doc.title!=='string' || !doc.title.trim() || doc.title.length>350 || /[\x00-\x1f\x7f]/.test(doc.title)
    || typeof doc.allDay!=='boolean' || typeof doc.timeZone!=='string' || doc.timeZone.length>100 || !doc.timeZone) invalid();
  try { new Intl.DateTimeFormat('en',{timeZone:doc.timeZone}).format(); } catch { invalid(); }
  const day=validDate(doc.date);
  if (doc.allDay) {
    const end=new Date(day.getTime()+86400000);
    if (end.getUTCFullYear()>9999) invalid();
    return {draft:{title:doc.title.trim(),date:doc.date,allDay:true,timeZone:doc.timeZone},
      event:{summary:doc.title.trim(),start:{date:doc.date},end:{date:end.toISOString().slice(0,10)}}};
  }
  const start=calendarInstant(doc.date,doc.startTime,doc.timeZone),end=calendarInstant(doc.endDate,doc.endTime,doc.timeZone);
  if (end<=start || end-start>86400000) invalid();
  return {draft:{title:doc.title.trim(),date:doc.date,allDay:false,startTime:doc.startTime,endDate:doc.endDate,endTime:doc.endTime,timeZone:doc.timeZone},
    event:{summary:doc.title.trim(),start:{dateTime:start.toISOString(),timeZone:doc.timeZone},end:{dateTime:end.toISOString(),timeZone:doc.timeZone}}};
}
