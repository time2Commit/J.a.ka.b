-- Project names are unique ignoring case, accents and extra whitespace.
CREATE UNIQUE INDEX "project_nameNormalized_key" ON "project"("nameNormalized");
