"""ReminderService for interview reminder sending.

This service provides methods for:
- Sending reminders to users
- Determining when to send reminders based on timing rules
- Managing reminder limits
"""

import logging
from datetime import UTC, datetime, timedelta

from src.services.dingtalk_sender import get_sender

logger = logging.getLogger(__name__)


class ReminderService:
    """Interview reminder service.

    This service handles:
    - Sending reminder messages
    - Determining when to send reminders
    - Managing reminder count limits
    """

    # Default constants
    REMINDER_INTERVAL_HOURS: int = 24  # Send reminder every 24 hours
    MAX_REMINDERS: int = 3  # Maximum 3 reminders per interview

    async def send_reminder(self, user_id: str, plan_name: str, remaining_days: int) -> bool:
        """Send interview reminder to a user.

        Args:
            user_id: Target user's staff ID in DingTalk
            plan_name: Interview plan/template name
            remaining_days: Days remaining before deadline

        Returns:
            True if reminder sent successfully, False otherwise

        """
        if not user_id:
            logger.warning("Cannot send reminder to empty user_id")
            return False

        try:
            sender = get_sender()

            # Build reminder message content
            if remaining_days <= 0:
                content = f"您好，您有一份访谈「{plan_name}」即将截止，请尽快参与完成。"
            else:
                content = f"您好，您有一份访谈「{plan_name}」待完成，还剩{remaining_days}天，请尽快参与。"

            result = await sender.send_text(user_id, content)

            if result:
                logger.info(f"Reminder sent to {user_id} for '{plan_name}' ({remaining_days} days remaining)")
            else:
                logger.warning(f"Failed to send reminder to {user_id}")

            return result

        except Exception as e:
            logger.exception(f"Error sending reminder to {user_id}: {e}")
            return False

    def should_send_reminder(self, invited_at: datetime | None, reminder_count: int) -> bool:
        """Determine if reminder should be sent based on timing rules.

        Args:
            invited_at: Timestamp when invitation was sent
            reminder_count: Number of reminders already sent

        Returns:
            True if reminder should be sent, False otherwise

        """
        # Handle None invited_at
        if invited_at is None:
            logger.warning("Cannot determine reminder timing: invited_at is None")
            return False

        # Check max reminder limit
        if reminder_count >= self.MAX_REMINDERS:
            logger.info(f"Reminder limit reached: {reminder_count} >= {self.MAX_REMINDERS}")
            return False

        # Handle negative reminder_count (treat as 0)
        reminder_count = max(reminder_count, 0)

        # Calculate hours since invitation
        now = datetime.now(UTC)
        # Ensure invited_at is timezone-aware for comparison
        if invited_at.tzinfo is None:
            invited_at = invited_at.replace(tzinfo=UTC)
        hours_since_invite = (now - invited_at).total_seconds() / 3600

        # Check if enough time has passed for next reminder
        # Each reminder is sent at (reminder_count + 1) * REMINDER_INTERVAL_HOURS
        required_hours = (reminder_count + 1) * self.REMINDER_INTERVAL_HOURS

        if hours_since_invite >= required_hours:
            logger.info(
                f"Reminder due: {hours_since_invite:.1f} hours since invite >= {required_hours} hours "
                f"(reminder #{reminder_count + 1})"
            )
            return True

        logger.debug(f"Reminder not due: {hours_since_invite:.1f} hours since invite < {required_hours} hours")
        return False

    def get_next_reminder_time(self, invited_at: datetime, reminder_count: int) -> datetime | None:
        """Calculate when the next reminder should be sent.

        Args:
            invited_at: Timestamp when invitation was sent
            reminder_count: Number of reminders already sent

        Returns:
            Datetime when next reminder should be sent, or None if limit reached

        """
        if reminder_count >= self.MAX_REMINDERS:
            return None

        # Handle negative reminder_count
        reminder_count = max(reminder_count, 0)

        # Next reminder at (reminder_count + 1) * interval hours after invite
        next_hours = (reminder_count + 1) * self.REMINDER_INTERVAL_HOURS
        return invited_at + timedelta(hours=next_hours)


# Singleton instance
_reminder_service: ReminderService | None = None


def get_reminder_service() -> ReminderService:
    """Get singleton ReminderService instance.

    Returns:
        ReminderService singleton instance

    """
    global _reminder_service
    if _reminder_service is None:
        _reminder_service = ReminderService()
    return _reminder_service
