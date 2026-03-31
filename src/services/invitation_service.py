"""InvitationService for interview invitation sending.

This service provides methods for:
- Sending single invitation to a user
- Batch sending invitations to multiple users
- Managing invitation queue
"""

import logging

from src.services.dingtalk_sender import get_sender

logger = logging.getLogger(__name__)


class InvitationService:
    """Interview invitation service.

    This service handles:
    - Single invitation sending
    - Batch invitation sending
    - Invitation queue management
    - Graceful error handling
    """

    def __init__(self) -> None:
        """Initialize InvitationService with queue."""
        self._queue: list[dict] = []

    async def send_invitation(self, user_id: str, plan_name: str, start_url: str) -> bool:
        """Send interview invitation to a user.

        Args:
            user_id: Target user's staff ID in DingTalk
            plan_name: Interview plan/template name
            start_url: URL to start the interview

        Returns:
            True if invitation sent successfully, False otherwise

        """
        if not user_id:
            logger.warning("Cannot send invitation to empty user_id")
            return False

        try:
            sender = get_sender()
            result = await sender.send_interview_invitation(user_id, plan_name, start_url)

            if result:
                logger.info(f"Invitation sent to {user_id} for '{plan_name}'")
            else:
                logger.warning(f"Failed to send invitation to {user_id}")

            return result

        except Exception as e:
            logger.exception(f"Error sending invitation to {user_id}: {e}")
            return False

    async def send_batch_invitations(self, invitations: list[dict]) -> dict[str, bool]:
        """Send batch invitations to multiple users.

        Args:
            invitations: List of invitation dicts with user_id, plan_name, start_url

        Returns:
            Dict mapping user_id to success status (True/False)

        """
        results: dict[str, bool] = {}

        if not invitations:
            logger.info("No invitations to send")
            return results

        for inv in invitations:
            user_id = inv.get("user_id", "")
            plan_name = inv.get("plan_name", "")
            start_url = inv.get("start_url", "")

            try:
                success = await self.send_invitation(user_id, plan_name, start_url)
                results[user_id] = success
            except Exception as e:
                logger.exception(f"Error in batch invitation for {user_id}: {e}")
                results[user_id] = False

        # Log summary
        success_count = sum(1 for v in results.values() if v)
        total_count = len(results)
        logger.info(f"Batch invitations complete: {success_count}/{total_count} successful")

        return results

    def add_to_queue(self, user_id: str, plan_name: str, start_url: str) -> None:
        """Add invitation to queue for later processing.

        Args:
            user_id: Target user's staff ID
            plan_name: Interview plan name
            start_url: URL to start interview

        """
        invitation = {"user_id": user_id, "plan_name": plan_name, "start_url": start_url}
        self._queue.append(invitation)
        logger.info(f"Added invitation for {user_id} to queue")

    async def process_queue(self) -> dict[str, bool]:
        """Process all pending invitations in queue.

        Returns:
            Dict mapping user_id to success status

        """
        if not self._queue:
            logger.info("Queue is empty, nothing to process")
            return {}

        # Copy queue and clear it
        invitations = self._queue.copy()
        self._queue.clear()

        logger.info(f"Processing {len(invitations)} queued invitations")
        return await self.send_batch_invitations(invitations)

    def get_queue_length(self) -> int:
        """Get current queue length.

        Returns:
            Number of pending invitations in queue

        """
        return len(self._queue)


# Singleton instance
_invitation_service: InvitationService | None = None


def get_invitation_service() -> InvitationService:
    """Get singleton InvitationService instance.

    Returns:
        InvitationService singleton instance

    """
    global _invitation_service
    if _invitation_service is None:
        _invitation_service = InvitationService()
    return _invitation_service
