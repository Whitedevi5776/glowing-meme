const store = new Map();

function getState(id) { return store.get(String(id)) || {}; }
function setState(id, s) { store.set(String(id), s); }
function clearState(id) { store.delete(String(id)); }

function sessionMiddleware() {
  return async (ctx, next) => {
    if (ctx.from?.id) {
      ctx.userState  = getState(ctx.from.id);
      ctx.setState   = (s) => setState(ctx.from.id, s);
      ctx.clearState = ()  => clearState(ctx.from.id);
    }
    return next();
  };
}

module.exports = { sessionMiddleware, getState, setState, clearState };
