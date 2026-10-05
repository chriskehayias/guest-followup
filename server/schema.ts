// Drizzle tables. Each CSV upload is one `uploads` row; its guest rows are stored
// verbatim (no trimming or normalizing) so reloading rebuilds the exact same board.

import { integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { ColumnName } from '../src/lib/types.ts';

export const uploads = pgTable('uploads', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileName: text('file_name').notNull(),
  rowCount: integer('row_count').notNull(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});

const cell = (name: string) => text(name).notNull().default('');

export const guests = pgTable(
  'guests',
  {
    uploadId: uuid('upload_id')
      .notNull()
      .references(() => uploads.id, { onDelete: 'cascade' }),
    /** 0-based position in the uploaded file, so rows come back in input order. */
    rowIndex: integer('row_index').notNull(),
    firstName: cell('first_name'),
    lastName: cell('last_name'),
    email: cell('email'),
    phone: cell('phone'),
    address: cell('address'),
    city: cell('city'),
    state: cell('state'),
    zip: cell('zip'),
    // Text, not date: invalid values like 2026-09-31 must survive the round trip.
    visitDate: cell('visit_date'),
    service: cell('service'),
    adults: cell('adults'),
    kids: cell('kids'),
    howHeard: cell('how_heard'),
    interestedIn: cell('interested_in'),
  },
  (t) => [primaryKey({ columns: [t.uploadId, t.rowIndex] })],
);

type GuestDbRow = typeof guests.$inferSelect;
type GuestField = Exclude<keyof GuestDbRow, 'uploadId' | 'rowIndex'>;

/** CSV column name -> guests table field. */
export const FIELD_FOR_COLUMN = {
  'First Name': 'firstName',
  'Last Name': 'lastName',
  Email: 'email',
  Phone: 'phone',
  Address: 'address',
  City: 'city',
  State: 'state',
  Zip: 'zip',
  'Visit Date': 'visitDate',
  Service: 'service',
  Adults: 'adults',
  Kids: 'kids',
  'How Heard': 'howHeard',
  'Interested In': 'interestedIn',
} as const satisfies Record<ColumnName, GuestField>;
