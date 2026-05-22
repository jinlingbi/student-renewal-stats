[build]
  publish = "."
  functions = "netlify/functions"

[[redirects]]
  from = "/api/records"
  to = "/.netlify/functions/records"
  status = 200
