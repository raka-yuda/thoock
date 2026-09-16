-- Adobe keyword exports in Stocklab use one word per ordered keyword. Split
-- legacy phrases, normalize case/apostrophes, preserve first-occurrence order,
-- remove duplicates, and retain Adobe's maximum of 50 keywords.
UPDATE "asset_metadata"
SET
	"keywords" = (
		SELECT coalesce(
			array_agg(ordered_word.keyword ORDER BY ordered_word.first_position),
			ARRAY[]::text[]
		)
		FROM (
			SELECT
				replace(split_word.value, '’', '''') AS keyword,
				min(keyword_value.position * 1000 + split_word.position) AS first_position
			FROM unnest("asset_metadata"."keywords") WITH ORDINALITY
				AS keyword_value(value, position)
			CROSS JOIN LATERAL regexp_split_to_table(
				lower(keyword_value.value),
				'[^[:alnum:]''’]+'
			) WITH ORDINALITY AS split_word(value, position)
			WHERE split_word.value <> ''
			GROUP BY replace(split_word.value, '’', '''')
			ORDER BY first_position
			LIMIT 50
		) AS ordered_word
	),
	"updated_at" = now();
