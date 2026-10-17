const v = require('./validation');

function itineraryInput(body, trip) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    v.fail(400, 'Each itinerary item must be an object.');
  const date = v.date(body.item_date, 'Itinerary date');
  if (date < trip.start_date || date > trip.end_date)
    v.fail(400, 'Itinerary date must fall within the trip dates.');
  const time = v.text(body.start_time, 'Time', 5, false);
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) v.fail(400, 'Time must use HH:MM format.');
  return [
    date,
    time || null,
    v.choice(body.kind, ['ACTIVITY', 'TRANSPORT', 'STAY', 'NOTE'], 'itinerary type'),
    v.text(body.title, 'Title', 100),
    v.text(body.location, 'Location', 200, false),
    v.text(body.notes, 'Notes', 2000, false),
  ];
}

function itineraryObject(fields) {
  return Object.fromEntries(
    ['item_date', 'start_time', 'kind', 'title', 'location', 'notes'].map((key, i) => [
      key,
      fields[i],
    ]),
  );
}

module.exports = { itineraryInput, itineraryObject };
