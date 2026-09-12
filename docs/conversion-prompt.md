# Converting a trip with an AI

Paste this prompt into Claude or ChatGPT along with your trip document, then
paste the JSON it returns into **Timeline → Paste an itinerary**.

Nothing is sent anywhere by the app itself — you run the conversion wherever you
already have a chat open, and the app only ever sees the finished JSON. That
keeps the app free of an API key, which matters: unlike the OAuth client id, an
API key *is* a secret and could not live in a public repo.

The app validates before writing, so a bad conversion is refused rather than
saved. If the model gets something wrong, fix the JSON and paste again.

---

## The prompt

````text
Convert the trip below into a single JSON document. Output only the JSON, with
no commentary and no markdown fence.

SCHEMA

{
  "schemaVersion": 1,
  "tripId": "<short-kebab-case-slug>",
  "name": "<trip name>",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "attachments": [],
  "items": [ ...one object per thing that happens... ]
}

Each item:

{
  "id": "<unique-kebab-case-slug>",
  "type": "flight" | "train" | "ferry" | "bus" | "car" | "lodging" | "activity" | "poi" | "note" | "document",
  "title": "<short label a person would recognise>",
  "startsAt": "YYYY-MM-DDTHH:MM:SS±HH:MM",
  "endsAt":   "YYYY-MM-DDTHH:MM:SS±HH:MM",
  "confirmationNumber": "<if there is one>",
  "notes": "<opening hours, prices, reminders>",
  "location": {
    "name": "<place name>",
    "address": "<full street address>",
    "phone": "<phone number in international form>"
  },
  "attachments": []
}

RULES

1. TIME ZONES ARE THE MOST IMPORTANT PART. Write every time exactly as it
   appears on the ticket or booking, and tag it with the offset of the place it
   happens. Never convert a time into another zone.
   - Leaving San Diego in May: "2026-05-08T11:40:00-07:00"
   - Arriving in Rome in May:  "2026-05-09T13:25:00+02:00"
   - Anywhere in Japan, all year: "+09:00"
   A flight therefore carries TWO different offsets: departure in the origin's
   zone, arrival in the destination's.
   Check whether daylight saving applies on that specific date. Europe is +01:00
   in winter and +02:00 in summer. US Pacific is -08:00 in winter and -07:00 in
   summer. Japan and Mexico do not change.

2. LODGING IS A SPAN. Give every stay both "startsAt" (check-in) and "endsAt"
   (check-out), with the hotel's address and phone number in "location". If the
   document states the property's standard check-in/check-out policy, repeat it
   in "notes" as well.

3. TRANSPORT TYPES. Use "flight", "train", "ferry", "bus" or "car" for anything
   that carries you between places, including a drive or a private transfer
   with nothing to book. Their documents are grouped together in the app, so
   getting the specific type right only affects the icon.

   Record these even when there is no ticket. The app compares where you sleep
   from one night to the next, and tells you when you are in a different town
   with nothing recorded that moved you there.

4. USE "activity" for anything booked or timed at a destination — museums,
   tours, parks, restaurant reservations.
   USE "poi" for a place you might go with no fixed time.

5. OPENING HOURS AND PRICES GO IN "notes", never in the time fields. Putting
   "8 AM – 5 PM" into startsAt/endsAt would claim you are there all day.
   Only use startsAt/endsAt for times YOU are committed to, such as a timed
   entry slot.

6. OMIT ANY FIELD YOU DO NOT HAVE. Do not invent times, addresses,
   confirmation numbers or phone numbers. An item with only a type and a title
   is valid and will appear under "Unscheduled".

7. Leave "attachments" as an empty array. PDFs are attached in the app later.

8. Every "id" must be unique within the trip.

TRIP DOCUMENT

<paste your itinerary, spreadsheet export, or booking emails here>
````

---

## Checking what comes back

Before pasting into the app, skim for the three things models get wrong:

- **Offsets.** Does the outbound flight use the origin's offset and the arrival
  the destination's? Does the offset match the season?
- **Invented detail.** Confirmation numbers and addresses that were not in your
  source. Delete anything you cannot verify.
- **Hours in the wrong place.** Museum opening hours belong in `notes`. If a
  sight has a `startsAt` of 08:00 and an `endsAt` of 17:00, the model has
  recorded the opening hours as your schedule.

The app refuses anything that is not valid against the schema, but it cannot
tell a plausible wrong time from a right one. That check is yours.
