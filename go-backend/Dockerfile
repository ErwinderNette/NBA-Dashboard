FROM golang:1.24-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/app ./cmd

FROM alpine:3.20

RUN apk add --no-cache ca-certificates && \
    addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY --from=builder /out/app /app/app
RUN mkdir -p /app/uploads/avatars && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3001

ENTRYPOINT ["/app/app"]
