-- Make githubRepo nullable since it is no longer required by the application
ALTER TABLE "Repo" ALTER COLUMN "githubRepo" DROP NOT NULL;
