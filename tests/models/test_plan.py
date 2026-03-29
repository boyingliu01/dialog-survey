"""
Tests for InterviewPlan and Interviewee models.
"""

from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.models.database import Base

# Use in-memory SQLite for testing
TEST_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture
def db_session():
    """Create a test database session."""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


class TestInterviewPlanModel:
    """Tests for InterviewPlan model."""

    def test_create_interview_plan(self, db_session):
        """Test creating an interview plan."""
        # Import after Base.metadata.create_all to avoid circular import issues
        from src.models.plan import InterviewPlan

        plan = InterviewPlan(
            name="2026 Q1 Customer Satisfaction Survey",
            description="Quarterly customer satisfaction survey for all regions",
            template_id="quality_survey",
        )
        db_session.add(plan)
        db_session.commit()

        assert plan.id is not None
        assert plan.name == "2026 Q1 Customer Satisfaction Survey"
        assert plan.status == "draft"
        assert plan.template_id == "quality_survey"

    def test_interview_plan_status_transitions(self, db_session):
        """Test interview plan status transitions."""
        from src.models.plan import InterviewPlan

        plan = InterviewPlan(name="Test Plan")
        db_session.add(plan)
        db_session.commit()

        # Transition to active
        plan.status = "active"
        db_session.commit()
        assert plan.status == "active"

        # Transition to completed
        plan.status = "completed"
        db_session.commit()
        assert plan.status == "completed"

        # Transition to cancelled
        plan.status = "cancelled"
        db_session.commit()
        assert plan.status == "cancelled"

    def test_interview_plan_with_dates(self, db_session):
        """Test interview plan with start and end dates."""
        from src.models.plan import InterviewPlan

        start_date = datetime(2026, 1, 1, 10, 0, 0)
        end_date = datetime(2026, 1, 31, 18, 0, 0)

        plan = InterviewPlan(
            name="January Survey",
            start_date=start_date,
            end_date=end_date,
        )
        db_session.add(plan)
        db_session.commit()

        assert plan.start_date == start_date
        assert plan.end_date == end_date

    def test_interview_plan_default_values(self, db_session):
        """Test interview plan default values."""
        from src.models.plan import InterviewPlan

        plan = InterviewPlan(name="Default Test")
        db_session.add(plan)
        db_session.commit()

        assert plan.status == "draft"
        assert plan.template_id == "quality_survey"
        assert plan.created_at is not None
        assert plan.updated_at is not None

    def test_interview_plan_query_by_id(self, db_session):
        """Test querying interview plan by id."""
        from src.models.plan import InterviewPlan

        plan = InterviewPlan(name="Query Test")
        db_session.add(plan)
        db_session.commit()

        result = db_session.query(InterviewPlan).filter_by(id=plan.id).first()

        assert result is not None
        assert result.name == "Query Test"


class TestIntervieweeModel:
    """Tests for Interviewee model."""

    def test_create_interviewee(self, db_session):
        """Test creating an interviewee."""
        from src.models.plan import InterviewPlan, Interviewee

        plan = InterviewPlan(name="Plan for Interviewee")
        db_session.add(plan)
        db_session.commit()

        interviewee = Interviewee(
            plan_id=plan.id,
            user_id="user_001",
            name="John Doe",
            phone="13800138000",
        )
        db_session.add(interviewee)
        db_session.commit()

        assert interviewee.id is not None
        assert interviewee.plan_id == plan.id
        assert interviewee.name == "John Doe"
        assert interviewee.status == "pending"

    def test_interviewee_status_transitions(self, db_session):
        """Test interviewee status transitions."""
        from src.models.plan import InterviewPlan, Interviewee

        plan = InterviewPlan(name="Status Test Plan")
        db_session.add(plan)
        db_session.commit()

        interviewee = Interviewee(plan_id=plan.id, name="Status User")
        db_session.add(interviewee)
        db_session.commit()

        # Transition to invited
        interviewee.status = "invited"
        interviewee.invited_at = datetime.utcnow()
        db_session.commit()
        assert interviewee.status == "invited"
        assert interviewee.invited_at is not None

        # Transition to in_progress
        interviewee.status = "in_progress"
        db_session.commit()
        assert interviewee.status == "in_progress"

        # Transition to completed
        interviewee.status = "completed"
        interviewee.completed_at = datetime.utcnow()
        db_session.commit()
        assert interviewee.status == "completed"
        assert interviewee.completed_at is not None

    def test_interviewee_default_status(self, db_session):
        """Test interviewee default status."""
        from src.models.plan import InterviewPlan, Interviewee

        plan = InterviewPlan(name="Default Status Plan")
        db_session.add(plan)
        db_session.commit()

        interviewee = Interviewee(plan_id=plan.id, name="Default User")
        db_session.add(interviewee)
        db_session.commit()

        assert interviewee.status == "pending"
        assert interviewee.invited_at is None
        assert interviewee.completed_at is None


class TestPlanIntervieweeRelationship:
    """Tests for relationship between InterviewPlan and Interviewee."""

    def test_plan_has_interviewees(self, db_session):
        """Test that plan has interviewees relationship."""
        from src.models.plan import InterviewPlan, Interviewee

        plan = InterviewPlan(name="Plan with Interviewees")
        db_session.add(plan)
        db_session.commit()

        interviewee1 = Interviewee(plan_id=plan.id, name="User 1")
        interviewee2 = Interviewee(plan_id=plan.id, name="User 2")
        db_session.add(interviewee1)
        db_session.add(interviewee2)
        db_session.commit()

        # Refresh to load relationships
        db_session.refresh(plan)

        assert len(plan.interviewees) == 2
        assert interviewee1 in plan.interviewees
        assert interviewee2 in plan.interviewees

    def test_interviewee_belongs_to_plan(self, db_session):
        """Test that interviewee belongs to a plan."""
        from src.models.plan import InterviewPlan, Interviewee

        plan = InterviewPlan(name="Parent Plan")
        db_session.add(plan)
        db_session.commit()

        interviewee = Interviewee(plan_id=plan.id, name="Child User")
        db_session.add(interviewee)
        db_session.commit()

        # Refresh to load relationships
        db_session.refresh(interviewee)

        assert interviewee.plan is not None
        assert interviewee.plan.name == "Parent Plan"

    def test_delete_plan_cascade_interviewees(self, db_session):
        """Test that deleting a plan removes associated interviewees."""
        from src.models.plan import InterviewPlan, Interviewee

        plan = InterviewPlan(name="Plan to Delete")
        db_session.add(plan)
        db_session.commit()

        interviewee = Interviewee(plan_id=plan.id, name="User to Delete")
        db_session.add(interviewee)
        db_session.commit()

        interviewee_id = interviewee.id

        # Delete the plan
        db_session.delete(plan)
        db_session.commit()

        # Check that interviewee is also deleted (cascade)
        result = db_session.query(Interviewee).filter_by(id=interviewee_id).first()
        assert result is None
