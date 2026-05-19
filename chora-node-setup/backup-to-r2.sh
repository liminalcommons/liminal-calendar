#!/bin/bash
# Offsite-backup sync: copies the most recent local Postgres backup to
# Cloudflare R2 (or any S3-compatible bucket). Run this on chora-node as
# a periodic cron / scheduled task — daily after the prodrigestivill
# backup scheduler has produced the latest dump.
#
# Setup (one-time):
#   1. Install rclone on chora-node:  https://rclone.org/install/
#   2. Configure an R2 remote:        rclone config  (choose s3 → Cloudflare R2)
#      Name the remote `r2`.
#   3. Create an R2 bucket called `calendar-backups`.
#   4. Add this script's path to a chora-node scheduled task running daily
#      at 03:00 (one hour after the in-container backup runs).
#
# What it does:
#   - Finds the most recent backup file in D:\projects\postgres-calendar\backups\
#     (any of last/daily/weekly/monthly subdirs)
#   - Uploads to r2:calendar-backups/<filename>
#   - Logs to D:\projects\postgres-calendar\backups\sync.log
#
# Recovery:
#   rclone copy r2:calendar-backups/calendar-YYYY-MM-DD.sql.gz .
#   docker exec -i postgres-calendar pg_restore -U calendar -d calendar -c < calendar-YYYY-MM-DD.sql.gz

set -e

BACKUP_DIR="${BACKUP_DIR:-/d/projects/postgres-calendar/backups}"
R2_REMOTE="${R2_REMOTE:-r2}"
R2_BUCKET="${R2_BUCKET:-calendar-backups}"
LOG="${BACKUP_DIR}/sync.log"

# Find the newest backup file across all subdirs (last/, daily/, weekly/, monthly/).
LATEST=$(find "$BACKUP_DIR" -type f -name "*.sql.gz" -printf "%T@ %p\n" 2>/dev/null \
  | sort -rn | head -1 | cut -d' ' -f2-)

if [ -z "$LATEST" ]; then
  echo "[$(date)] No backup file found in $BACKUP_DIR" | tee -a "$LOG"
  exit 1
fi

REMOTE_NAME=$(basename "$LATEST")
echo "[$(date)] Uploading $LATEST to ${R2_REMOTE}:${R2_BUCKET}/${REMOTE_NAME}" | tee -a "$LOG"

if ! command -v rclone >/dev/null 2>&1; then
  echo "[$(date)] ERROR: rclone not installed" | tee -a "$LOG"
  exit 1
fi

rclone copy "$LATEST" "${R2_REMOTE}:${R2_BUCKET}/" --progress 2>&1 | tee -a "$LOG"

# Retention on the remote: keep last 90 days only.
rclone delete "${R2_REMOTE}:${R2_BUCKET}/" --min-age 90d 2>&1 | tee -a "$LOG"

echo "[$(date)] Done." | tee -a "$LOG"
