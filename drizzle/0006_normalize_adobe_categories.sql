-- Adobe's Contributor CSV accepts category numbers 1-21. Normalize category
-- labels and captured portal keys that earlier Stocklab versions stored as text.
-- Unknown values are intentionally left unchanged so the compliance gate blocks
-- export until the owner selects a real category instead of guessing one.
UPDATE "asset_metadata"
SET
	"category" = CASE lower(trim("category"))
		WHEN 'animals' THEN '1'
		WHEN '10001' THEN '1'
		WHEN 'buildings and architecture' THEN '2'
		WHEN '10092' THEN '2'
		WHEN 'business' THEN '3'
		WHEN '10162' THEN '3'
		WHEN 'drinks' THEN '4'
		WHEN '10209' THEN '4'
		WHEN 'the environment' THEN '5'
		WHEN '10235' THEN '5'
		WHEN 'states of mind' THEN '6'
		WHEN '10255' THEN '6'
		WHEN 'food' THEN '7'
		WHEN '10283' THEN '7'
		WHEN 'graphic resources' THEN '8'
		WHEN '10432' THEN '8'
		WHEN 'hobbies and leisure' THEN '9'
		WHEN '10486' THEN '9'
		WHEN 'industry' THEN '10'
		WHEN '10556' THEN '10'
		WHEN 'landscape' THEN '11'
		WHEN 'landscapes' THEN '11'
		WHEN '10584' THEN '11'
		WHEN 'lifestyle' THEN '12'
		WHEN '10631' THEN '12'
		WHEN 'people' THEN '13'
		WHEN '10683' THEN '13'
		WHEN 'plants and flowers' THEN '14'
		WHEN '10733' THEN '14'
		WHEN 'culture and religion' THEN '15'
		WHEN '10778' THEN '15'
		WHEN 'science' THEN '16'
		WHEN '10797' THEN '16'
		WHEN 'social issues' THEN '17'
		WHEN '10834' THEN '17'
		WHEN 'sports' THEN '18'
		WHEN '10868' THEN '18'
		WHEN 'technology' THEN '19'
		WHEN '10927' THEN '19'
		WHEN 'transport' THEN '20'
		WHEN '10958' THEN '20'
		WHEN 'travel' THEN '21'
		WHEN '10988' THEN '21'
	END,
	"updated_at" = now()
WHERE lower(trim("category")) IN (
	'animals', '10001',
	'buildings and architecture', '10092',
	'business', '10162',
	'drinks', '10209',
	'the environment', '10235',
	'states of mind', '10255',
	'food', '10283',
	'graphic resources', '10432',
	'hobbies and leisure', '10486',
	'industry', '10556',
	'landscape', 'landscapes', '10584',
	'lifestyle', '10631',
	'people', '10683',
	'plants and flowers', '10733',
	'culture and religion', '10778',
	'science', '10797',
	'social issues', '10834',
	'sports', '10868',
	'technology', '10927',
	'transport', '10958',
	'travel', '10988'
);
