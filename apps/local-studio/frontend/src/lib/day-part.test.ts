import assert from "node:assert/strict";
import { test } from "node:test";
import { dayPartFromHour, greetingForDayPart, greetingNameFromDisplay } from "./day-part.ts";

test("day parts follow local hour boundaries", () => {
  assert.equal(dayPartFromHour(0), "late-night");
  assert.equal(dayPartFromHour(4), "late-night");
  assert.equal(dayPartFromHour(5), "morning");
  assert.equal(dayPartFromHour(11), "morning");
  assert.equal(dayPartFromHour(12), "afternoon");
  assert.equal(dayPartFromHour(16), "afternoon");
  assert.equal(dayPartFromHour(17), "evening");
  assert.equal(dayPartFromHour(23), "evening");
});

test("greeting includes the first name only when one is known", () => {
  assert.equal(greetingForDayPart("morning", "Sam"), "Morning, Sam");
  assert.equal(greetingForDayPart("late-night", "Sam"), "Late night, Sam");
  assert.equal(greetingForDayPart("evening", ""), "Evening");
  assert.equal(greetingForDayPart("afternoon", null), "Afternoon");
  assert.equal(greetingNameFromDisplay("Sam Primeaux"), "Sam");
  assert.equal(greetingNameFromDisplay(null), "");
});
