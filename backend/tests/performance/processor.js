module.exports = {
  // Called before a scenario starts
  beforeScenario: function(requestParams, context, ee, next) {
    // Add timestamp to context
    context.vars.timestamp = Date.now();
    
    // Add random delay for more realistic behavior
    context.vars.thinkTime = Math.floor(Math.random() * 3) + 1;
    
    return next();
  },

  // Called after a response is received
  afterResponse: function(requestParams, response, context, ee, next) {
    // Log slow responses
    if (response.timings && response.timings.response > 1000) {
      console.log(`Slow response: ${response.timings.response}ms for ${requestParams.url}`);
    }
    
    // Extract data from responses
    if (response.body && typeof response.body === 'object') {
      if (response.body.requiresAuth) {
        ee.emit('counter', 'workflows.requiresAuth', 1);
      }
      if (response.body.requiresHITL) {
        ee.emit('counter', 'workflows.requiresHITL', 1);
      }
      if (response.body.status === 'complete') {
        ee.emit('counter', 'workflows.completed', 1);
      }
    }
    
    return next();
  }
}; 