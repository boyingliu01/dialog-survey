"""Initial migration: create interviews and messages tables

Revision ID: 0001_initial
Revises:
Create Date: 2026-03-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create enum type for interview status
    interview_status_enum = postgresql.ENUM(
        'pending', 'in_progress', 'completed', 'cancelled',
        name='interviewstatus',
        create_type=False
    )
    interview_status_enum.create(op.get_bind(), checkfirst=True)

    # Create interviews table
    op.create_table(
        'interviews',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.String(length=100), nullable=False),
        sa.Column('user_id', sa.String(length=100), nullable=False),
        sa.Column('template_id', sa.String(length=50), nullable=True),
        sa.Column('status', interview_status_enum, nullable=True),
        sa.Column('current_topic_index', sa.Integer(), nullable=True),
        sa.Column('conversation_history', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('extracted_info', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('topic', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('report_path', sa.String(length=500), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_interviews_id'), 'interviews', ['id'], unique=False)
    op.create_index(op.f('ix_interviews_session_id'), 'interviews', ['session_id'], unique=True)
    op.create_index(op.f('ix_interviews_user_id'), 'interviews', ['user_id'], unique=False)

    # Create messages table
    op.create_table(
        'messages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('interview_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(length=20), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('message_type', sa.String(length=20), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['interview_id'], ['interviews.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_messages_id'), 'messages', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_messages_id'), table_name='messages')
    op.drop_table('messages')

    op.drop_index(op.f('ix_interviews_user_id'), table_name='interviews')
    op.drop_index(op.f('ix_interviews_session_id'), table_name='interviews')
    op.drop_index(op.f('ix_interviews_id'), table_name='interviews')
    op.drop_table('interviews')

    # Drop enum type
    interview_status_enum = postgresql.ENUM(
        'pending', 'in_progress', 'completed', 'cancelled',
        name='interviewstatus',
        create_type=False
    )
    interview_status_enum.drop(op.get_bind(), checkfirst=True)