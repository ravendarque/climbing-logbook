import { handleGet, handlePost, handlePut, handleDelete } from "./api/logbook.js";
import { handleLogin, handleLogout } from "./api/login.js";
import { handleSession } from "./api/session.js";

// This Worker is only ever invoked for requests that don't match a static
// asset under public/ (Workers Static Assets serves those directly) — so
// everything reaching fetch() here is an /logbook/api/* call.
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const method = request.method;

    if (pathname === "/logbook/api/logbook") {
      if (method === "GET")    return handleGet(request, env);
      if (method === "POST")   return handlePost(request, env);
      if (method === "PUT")    return handlePut(request, env);
      if (method === "DELETE") return handleDelete(request, env);
    }

    if (pathname === "/logbook/api/login") {
      if (method === "POST")   return handleLogin(request, env);
      if (method === "DELETE") return handleLogout();
    }

    if (pathname === "/logbook/api/session" && method === "GET") {
      return handleSession(request, env);
    }

    return new Response("Not found", { status: 404 });
  },
};
