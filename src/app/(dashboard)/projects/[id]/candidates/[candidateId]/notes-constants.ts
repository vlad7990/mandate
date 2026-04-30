// Shared constants for the candidate-notes feature.
//
// Why this file exists separately from notes-actions.ts:
// `"use server"` files are restricted to exporting *async* functions
// because every export from such a file becomes a callable server
// action reference at runtime. Exporting a const (an array, a string,
// an object) yields a runtime error in Server Action codegen on the
// strict path, and on the relaxed path it ships a server-action proxy
// to the client where `.map`/`.includes` no longer work — the
// component sees a function, not the array.
//
// Anything in this file is plain client-safe data. Both the server
// action runner and the client UI import from here.

export const NOTE_TYPES = [
  "general",
  "call",
  "meeting",
  "email",
  "interview",
] as const;

export type NoteType = (typeof NOTE_TYPES)[number];
