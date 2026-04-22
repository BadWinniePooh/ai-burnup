FROM nginx:alpine

# Copy all frontend source files into the nginx web root
COPY project/ /usr/share/nginx/html/

# In Docker, /api/ requests are proxied through nginx to the backend container,
# so the browser uses same-origin relative URLs (empty string base).
# We activate the override that is commented out in the HTML for local dev.
RUN sed -i \
    "s|// window.__BURNUP_API__ = 'http://localhost:5000';|window.__BURNUP_API__ = '';|" \
    "/usr/share/nginx/html/Burnup PM Tool.html"

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
