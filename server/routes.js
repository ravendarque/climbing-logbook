import { handleGet, handlePost, handlePut, handleDelete } from "./api/entries.js";
import { handleImport } from "./api/entries-import.js";
import {
  handleDelete as handleDeletePlace,
  handleGet as handleGetPlaces,
  handlePost as handlePostPlaces,
  handlePut as handlePutPlace,
} from "./api/places.js";
import {
  handleDelete as handleDeleteLocation,
  handleGet as handleGetLocations,
  handlePost as handlePostLocations,
  handlePut as handlePutLocation,
} from "./api/locations.js";
import { handleGetSettings, handlePatchSettings } from "./api/settings.js";
import {
  handleGetEffort,
  handleGetGap,
  handleGetInjuryLog,
  handleGetPyramid,
  handleGetStrengthsWeaknesses,
  handleGetVolume,
} from "./api/performance.js";
import { handleGetMapCounts } from "./api/map.js";
import { handleAgreeTerms } from "./lib/terms.js";
import {
  handleGetPainInjuryConsent,
  handleGrantPainInjuryConsent,
  handleWithdrawPainInjuryConsent,
} from "./lib/health-consent.js";

// Every path and method here needs a session; test/authorization-matrix.test.js needs a fixture for each.
export const RESOURCE_ROUTES = {
  "/-/api/entries": {
    GET: handleGet,
    POST: handlePost,
    PUT: handlePut,
    DELETE: handleDelete,
  },
  "/-/api/entries/import": { POST: handleImport },
  "/-/api/places": { GET: handleGetPlaces, POST: handlePostPlaces, PUT: handlePutPlace, DELETE: handleDeletePlace },
  "/-/api/locations": {
    GET: handleGetLocations,
    POST: handlePostLocations,
    PUT: handlePutLocation,
    DELETE: handleDeleteLocation,
  },
  "/-/api/settings": { GET: handleGetSettings, PATCH: handlePatchSettings },
  "/-/api/performance/pyramid": { GET: handleGetPyramid },
  "/-/api/performance/injury": { GET: handleGetInjuryLog },
  "/-/api/performance/strengths": { GET: handleGetStrengthsWeaknesses },
  "/-/api/performance/volume": { GET: handleGetVolume },
  "/-/api/performance/gap": { GET: handleGetGap },
  "/-/api/performance/rpe": { GET: handleGetEffort },
  "/-/api/map/counts": { GET: handleGetMapCounts },
  "/-/api/terms": { POST: handleAgreeTerms },
  "/-/api/consent/pain-injury": {
    GET: handleGetPainInjuryConsent,
    POST: handleGrantPainInjuryConsent,
    DELETE: handleWithdrawPainInjuryConsent,
  },
};
