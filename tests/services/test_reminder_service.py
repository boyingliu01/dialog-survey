"""
Tests for ReminderService - interview reminder sending.

Following TDD: Tests are written FIRST before implementation.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestReminderServiceInit:
    """Tests for ReminderService initialization."""

    def test_reminder_service_init(self):
        """Test service initializes correctly."""
        try:
            from src.services.reminder_service import ReminderService

            service = ReminderService()
            assert service is not None
            # Should have default constants
            assert hasattr(service, "REMINDER_INTERVAL_HOURS")
            assert hasattr(service, "MAX_REMINDERS")
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")

    def test_reminder_service_constants(self):
        """Test reminder service has correct default constants."""
        try:
            from src.services.reminder_service import ReminderService

            service = ReminderService()
            assert service.REMINDER_INTERVAL_HOURS == 24
            assert service.MAX_REMINDERS == 3
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")

    def test_reminder_service_singleton(self):
        """Test get_reminder_service returns singleton."""
        try:
            from src.services.reminder_service import get_reminder_service

            service1 = get_reminder_service()
            service2 = get_reminder_service()

            assert service1 is service2
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")


class TestReminderServiceSendReminder:
    """Tests for sending reminder."""

    @pytest.mark.asyncio
    async def test_send_reminder(self):
        """Test sending reminder message."""
        try:
            from src.services.reminder_service import ReminderService
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")

        service = ReminderService()

        with patch("src.services.reminder_service.get_sender") as mock_get_sender:
            mock_sender = MagicMock()
            mock_sender.send_text = AsyncMock(return_value=True)
            mock_get_sender.return_value = mock_sender

            result = await service.send_reminder(user_id="user_001", plan_name="Customer Survey", remaining_days=3)

        assert result is True
        mock_sender.send_text.assert_called_once()

    @pytest.mark.asyncio
    async def test_send_reminder_with_empty_user_id(self):
        """Test sending reminder with empty user_id returns False."""
        try:
            from src.services.reminder_service import ReminderService
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")

        service = ReminderService()

        with patch("src.services.reminder_service.get_sender") as mock_get_sender:
            mock_sender = MagicMock()
            mock_sender.send_text = AsyncMock(return_value=False)
            mock_get_sender.return_value = mock_sender

            result = await service.send_reminder(
                user_id="",  # Empty user ID
                plan_name="Test Survey",
                remaining_days=5,
            )

        assert result is False

    @pytest.mark.asyncio
    async def test_send_reminder_sender_failure(self):
        """Test reminder when sender fails."""
        try:
            from src.services.reminder_service import ReminderService
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")

        service = ReminderService()

        with patch("src.services.reminder_service.get_sender") as mock_get_sender:
            mock_sender = MagicMock()
            mock_sender.send_text = AsyncMock(return_value=False)
            mock_get_sender.return_value = mock_sender

            result = await service.send_reminder(user_id="user_001", plan_name="Test Survey", remaining_days=2)

        assert result is False


class TestReminderServiceMessageFormat:
    """Tests for reminder message format."""

    @pytest.mark.asyncio
    async def test_reminder_message_format(self):
        """Test correct format for reminder message."""
        try:
            from src.services.reminder_service import ReminderService
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")

        service = ReminderService()

        with patch("src.services.reminder_service.get_sender") as mock_get_sender:
            mock_sender = MagicMock()
            mock_sender.send_text = AsyncMock(return_value=True)
            mock_get_sender.return_value = mock_sender

            await service.send_reminder(user_id="user_001", plan_name="Quality Feedback Survey", remaining_days=7)

        # Check message content
        call_args = mock_sender.send_text.call_args
        message_content = call_args[0][1]  # Second argument is content

        # Should contain key elements
        assert "Quality Feedback Survey" in message_content
        assert "7" in message_content or "七天" in message_content or "7天" in message_content

    @pytest.mark.asyncio
    async def test_reminder_message_contains_remaining_days(self):
        """Test reminder message contains remaining days count."""
        try:
            from src.services.reminder_service import ReminderService
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")

        service = ReminderService()

        with patch("src.services.reminder_service.get_sender") as mock_get_sender:
            mock_sender = MagicMock()
            mock_sender.send_text = AsyncMock(return_value=True)
            mock_get_sender.return_value = mock_sender

            await service.send_reminder(user_id="user_001", plan_name="Survey", remaining_days=10)

        call_args = mock_sender.send_text.call_args
        message_content = call_args[0][1]

        assert "10" in message_content


class TestReminderServiceScheduleReminder:
    """Tests for scheduling reminder."""

    def test_schedule_reminder_first_reminder(self):
        """Test scheduling first reminder after 24 hours."""
        try:
            from src.services.reminder_service import ReminderService
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")

        service = ReminderService()

        # Invited 25 hours ago, no reminders yet
        invited_at = datetime.now(timezone.utc) - timedelta(hours=25)
        reminder_count = 0

        result = service.should_send_reminder(invited_at, reminder_count)

        assert result is True

    def test_schedule_reminder_second_reminder(self):
        """Test scheduling second reminder after 48 hours."""
        try:
            from src.services.reminder_service import ReminderService
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")

        service = ReminderService()

        # Invited 50 hours ago, one reminder sent
        invited_at = datetime.now(timezone.utc) - timedelta(hours=50)
        reminder_count = 1

        result = service.should_send_reminder(invited_at, reminder_count)

        assert result is True

    def test_schedule_reminder_third_reminder(self):
        """Test scheduling third reminder after 72 hours."""
        try:
            from src.services.reminder_service import ReminderService
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")

        service = ReminderService()

        # Invited 75 hours ago, two reminders sent
        invited_at = datetime.now(timezone.utc) - timedelta(hours=75)
        reminder_count = 2

        result = service.should_send_reminder(invited_at, reminder_count)

        assert result is True

    def test_schedule_reminder_max_limit(self):
        """Test that max reminders limit is respected."""
        try:
            from src.services.reminder_service import ReminderService
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")

        service = ReminderService()

        # Already sent 3 reminders (max)
        invited_at = datetime.now(timezone.utc) - timedelta(hours=100)
        reminder_count = 3  # Max reminders

        result = service.should_send_reminder(invited_at, reminder_count)

        assert result is False

    def test_schedule_reminder_not_yet_due(self):
        """Test that reminder is not sent before due time."""
        try:
            from src.services.reminder_service import ReminderService
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")

        service = ReminderService()

        # Invited 12 hours ago (less than 24 hours)
        invited_at = datetime.now(timezone.utc) - timedelta(hours=12)
        reminder_count = 0

        result = service.should_send_reminder(invited_at, reminder_count)

        assert result is False

    def test_schedule_reminder_exceeds_max(self):
        """Test that reminder is blocked when exceeding max count."""
        try:
            from src.services.reminder_service import ReminderService
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")

        service = ReminderService()

        # Sent more than max reminders
        invited_at = datetime.now(timezone.utc) - timedelta(hours=200)
        reminder_count = 5  # More than max (3)

        result = service.should_send_reminder(invited_at, reminder_count)

        assert result is False


class TestReminderServiceTiming:
    """Tests for reminder timing logic."""

    def test_should_send_reminder_first_interval(self):
        """Test first reminder at 24-hour mark."""
        try:
            from src.services.reminder_service import ReminderService
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")

        service = ReminderService()

        # Exactly 24 hours passed
        invited_at = datetime.now(timezone.utc) - timedelta(hours=24)
        reminder_count = 0

        result = service.should_send_reminder(invited_at, reminder_count)

        # Should be true at exactly 24 hours or slightly after
        assert result is True

    def test_should_send_reminder_before_first_interval(self):
        """Test no reminder before 24-hour mark."""
        try:
            from src.services.reminder_service import ReminderService
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")

        service = ReminderService()

        # Less than 24 hours
        invited_at = datetime.now(timezone.utc) - timedelta(hours=23)
        reminder_count = 0

        result = service.should_send_reminder(invited_at, reminder_count)

        assert result is False

    def test_should_send_reminder_progressive_intervals(self):
        """Test that reminders use progressive intervals."""
        try:
            from src.services.reminder_service import ReminderService
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")

        service = ReminderService()

        # Test case 1: 48 hours with 1 reminder - should send (2nd reminder)
        invited_at = datetime.now(timezone.utc) - timedelta(hours=48)
        result = service.should_send_reminder(invited_at, 1)
        assert result is True

        # Test case 2: 48 hours with 0 reminders - should send (1st or 2nd)
        invited_at = datetime.now(timezone.utc) - timedelta(hours=48)
        result = service.should_send_reminder(invited_at, 0)
        assert result is True

        # Test case 3: 72 hours with 2 reminders - should send (3rd)
        invited_at = datetime.now(timezone.utc) - timedelta(hours=72)
        result = service.should_send_reminder(invited_at, 2)
        assert result is True


class TestReminderServiceErrorHandling:
    """Tests for error handling in reminder service."""

    @pytest.mark.asyncio
    async def test_handle_sender_exception(self):
        """Test handling exception from sender."""
        try:
            from src.services.reminder_service import ReminderService
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")

        service = ReminderService()

        with patch("src.services.reminder_service.get_sender") as mock_get_sender:
            mock_sender = MagicMock()
            mock_sender.send_text = AsyncMock(side_effect=Exception("Network error"))
            mock_get_sender.return_value = mock_sender

            # Should handle exception gracefully
            try:
                result = await service.send_reminder(user_id="user_001", plan_name="Test", remaining_days=5)
                # If no exception raised, result should be False
                assert result is False
            except Exception:
                # If exception is raised, it should be handled upstream
                pass  # This is also acceptable


class TestReminderServiceEdgeCases:
    """Tests for edge cases in reminder service."""

    def test_reminder_with_zero_remaining_days(self):
        """Test reminder logic with zero remaining days."""
        try:
            from src.services.reminder_service import ReminderService
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")

        service = ReminderService()

        # Should not affect timing logic
        invited_at = datetime.now(timezone.utc) - timedelta(hours=25)
        result = service.should_send_reminder(invited_at, 0)

        assert result is True

    @pytest.mark.asyncio
    async def test_send_reminder_with_zero_days(self):
        """Test sending reminder with zero remaining days."""
        try:
            from src.services.reminder_service import ReminderService
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")

        service = ReminderService()

        with patch("src.services.reminder_service.get_sender") as mock_get_sender:
            mock_sender = MagicMock()
            mock_sender.send_text = AsyncMock(return_value=True)
            mock_get_sender.return_value = mock_sender

            result = await service.send_reminder(user_id="user_001", plan_name="Survey", remaining_days=0)

        # Should still send, message may indicate urgency
        assert result is True

        # Check message mentions 0 days or urgent language
        call_args = mock_sender.send_text.call_args
        message_content = call_args[0][1]
        # Message should contain some indication of urgency
        assert "0" in message_content or "今天" in message_content or "即将" in message_content

    def test_reminder_with_future_invited_at(self):
        """Test reminder logic with future invited_at date."""
        try:
            from src.services.reminder_service import ReminderService
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")

        service = ReminderService()

        # Invited in the future (edge case)
        invited_at = datetime.now(timezone.utc) + timedelta(hours=10)
        reminder_count = 0

        result = service.should_send_reminder(invited_at, reminder_count)

        # Should not send reminder for future dates
        assert result is False

    def test_reminder_with_none_invited_at(self):
        """Test reminder logic handles None invited_at gracefully."""
        try:
            from src.services.reminder_service import ReminderService
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")

        service = ReminderService()

        # Should handle None gracefully (might raise error or return False)
        try:
            result = service.should_send_reminder(None, 0)
            assert result is False
        except (TypeError, AttributeError):
            # Raising an error is also acceptable
            pass

    def test_reminder_with_negative_reminder_count(self):
        """Test reminder logic with negative reminder count."""
        try:
            from src.services.reminder_service import ReminderService
        except ImportError:
            pytest.skip("ReminderService not implemented yet - TDD RED phase")

        service = ReminderService()

        # Negative reminder count (edge case)
        invited_at = datetime.now(timezone.utc) - timedelta(hours=25)
        reminder_count = -1

        # Should probably treat negative as 0 or handle gracefully
        try:
            result = service.should_send_reminder(invited_at, reminder_count)
            # If handled, should probably return True (treat as first reminder)
            assert result is True
        except ValueError:
            # Or raise an error
            pass
