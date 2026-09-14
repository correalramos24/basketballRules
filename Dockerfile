FROM nginx:alpine

COPY index.html styles.css script.js reglesFCBQ.md interpretacionsFCBQ.md /usr/share/nginx/html/
COPY vendor /usr/share/nginx/html/vendor
COPY images /usr/share/nginx/html/images