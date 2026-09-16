import { describe, expect, it } from "vitest";
import {
  BRIEF_CSV_COLUMNS,
  generateBriefCsvTemplate,
  parseBriefCsv,
} from "./brief-csv";

describe("commercial brief CSV", () => {
  it("parses quoted text and pipe-separated lists while applying safe defaults", () => {
    const csv = [
      "name,main_subject,intended_usage,supporting_subjects,prohibited_elements,orientation,opportunity_keyword",
      'Morning meal prep,"Parent preparing lunch, calmly","Website, email and presentation",lunchbox|fresh fruit|lunchbox,logos|labels,horizontal,Healthy local meal planning',
    ].join("\n");
    const result = parseBriefCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      row: 2,
      opportunityKeyword: "Healthy local meal planning",
      brief: {
        name: "Morning meal prep",
        intendedUsage: "Website, email and presentation",
        supportingSubjects: ["lunchbox", "fresh fruit"],
        prohibitedElements: ["logos", "labels"],
        candidateCount: 1,
      },
    });
  });

  it("reports row-specific validation errors without returning partial rows", () => {
    const result = parseBriefCsv(
      "name,main_subject,orientation,candidate_count\nA,x,panorama,20",
    );
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 2, field: "name" }),
        expect.objectContaining({ row: 2, field: "main_subject" }),
        expect.objectContaining({ row: 2, field: "orientation" }),
        expect.objectContaining({ row: 2, field: "candidate_count" }),
      ]),
    );
  });

  it("generates a header-only template with every supported column", () => {
    const template = generateBriefCsvTemplate();
    expect(template.trim().split(",")).toEqual([...BRIEF_CSV_COLUMNS]);
    expect(parseBriefCsv(template).errors[0]).toMatchObject({ row: 2 });
  });

  it("imports and normalizes an Adobe metadata plan from a chat-agent CSV", () => {
    const result = parseBriefCsv(
      [
        "name,main_subject,metadata_title,adobe_category,metadata_keywords,metadata_language,fictional_people_property,metadata_notes",
        'Useful commute,Professional cycling to work,Healthy urban commute for modern professionals,Transport,"commute|cycling|and|professional|urban|sustainable",en,yes,Confirm fictional person label',
      ].join("\n"),
    );
    expect(result.errors).toEqual([]);
    expect(result.rows[0].brief).toMatchObject({
      metadataTitle: "Healthy urban commute for modern professionals",
      metadataCategory: "20",
      metadataKeywords: [
        "commute",
        "cycling",
        "professional",
        "urban",
        "sustainable",
      ],
      metadataLanguage: "en",
      metadataFictionalPeopleProperty: true,
      metadataNotes: "Confirm fictional person label",
    });
  });
});
