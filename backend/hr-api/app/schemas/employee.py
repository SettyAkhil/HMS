import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models.employee import EMPLOYEE_CATEGORIES, EMPLOYMENT_TYPES

Category = Literal[EMPLOYEE_CATEGORIES]  # type: ignore[valid-type]
EmploymentType = Literal[EMPLOYMENT_TYPES]  # type: ignore[valid-type]
Gender = Literal["male", "female", "other", "undisclosed"]
Phone = Field(None, max_length=30, pattern=r"^[0-9+()\- ]{6,30}$")


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class DepartmentAssignmentIn(BaseModel):
    department_id: uuid.UUID
    unit_id: uuid.UUID | None = None
    is_primary: bool = False
    allocation_percent: int = Field(100, ge=1, le=100)


class ContactIn(BaseModel):
    kind: Literal["emergency", "alternate", "family"] = "emergency"
    name: str = Field(min_length=1, max_length=160)
    relationship: str | None = Field(None, max_length=60)
    phone: str | None = Phone
    email: EmailStr | None = None


class ContactOut(ORM, ContactIn):
    id: uuid.UUID
    email: str | None = None


class CredentialIn(BaseModel):
    credential_type: Literal["medical_registration", "nursing_registration", "pharmacy_registration",
                             "licence", "certification", "other"]
    number: str = Field(min_length=1, max_length=80)
    issuing_authority: str | None = Field(None, max_length=200)
    issued_on: date | None = None
    expires_on: date | None = None

    @model_validator(mode="after")
    def _dates(self):
        if self.issued_on and self.expires_on and self.expires_on <= self.issued_on:
            raise ValueError("expires_on must be after issued_on")
        return self


class CredentialOut(ORM):
    id: uuid.UUID
    credential_type: str
    number: str
    issuing_authority: str | None
    issued_on: date | None
    expires_on: date | None
    verification_status: str
    verified_by: str | None
    verified_at: datetime | None
    days_to_expiry: int | None = None


class ProfileFields(BaseModel):
    qualification: str | None = Field(None, max_length=200)
    specialization: str | None = Field(None, max_length=200)
    blood_group: Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] | None = None
    clinical_competencies: list[str] = Field(default_factory=list, max_length=50)
    languages: list[str] = Field(default_factory=list, max_length=20)


class PersonalFields(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    middle_name: str | None = Field(None, max_length=80)
    last_name: str | None = Field(None, max_length=80)
    date_of_birth: date | None = None
    gender: Gender | None = None
    email: EmailStr | None = None
    phone: str | None = Phone
    address_line: str | None = Field(None, max_length=500)
    city: str | None = Field(None, max_length=120)
    state: str | None = Field(None, max_length=120)
    postal_code: str | None = Field(None, max_length=20)

    @field_validator("date_of_birth")
    @classmethod
    def _adult(cls, v: date | None):
        if v and (date.today().year - v.year) < 16:
            raise ValueError("employee must be at least 16 years old")
        return v


class EmployeeCreate(PersonalFields):
    employee_category: Category
    employment_type: EmploymentType = "permanent"
    joining_date: date
    contract_end_date: date | None = None
    branch_id: uuid.UUID | None = None
    designation_id: uuid.UUID | None = None
    reporting_manager_id: uuid.UUID | None = None
    salary_structure_ref: str | None = Field(None, max_length=60)
    hms_username: str | None = Field(None, max_length=120)
    departments: list[DepartmentAssignmentIn] = Field(default_factory=list, max_length=10)
    contacts: list[ContactIn] = Field(default_factory=list, max_length=10)
    credentials: list[CredentialIn] = Field(default_factory=list, max_length=20)
    profile: ProfileFields = Field(default_factory=ProfileFields)
    activate: bool = False

    @model_validator(mode="after")
    def _rules(self):
        if self.employment_type == "contract" and not self.contract_end_date:
            raise ValueError("contract employees need a contract_end_date")
        if self.contract_end_date and self.contract_end_date <= self.joining_date:
            raise ValueError("contract_end_date must be after joining_date")
        if sum(1 for d in self.departments if d.is_primary) > 1:
            raise ValueError("only one department can be primary")
        if len({d.department_id for d in self.departments}) != len(self.departments):
            raise ValueError("a department is listed twice")
        return self


class EmployeeUpdate(BaseModel):
    """Personal and professional details only. Placement goes through
    /transfer and status through the lifecycle actions, so history is kept."""

    first_name: str | None = Field(None, min_length=1, max_length=80)
    middle_name: str | None = Field(None, max_length=80)
    last_name: str | None = Field(None, max_length=80)
    date_of_birth: date | None = None
    gender: Gender | None = None
    email: EmailStr | None = None
    phone: str | None = Phone
    address_line: str | None = Field(None, max_length=500)
    city: str | None = Field(None, max_length=120)
    state: str | None = Field(None, max_length=120)
    postal_code: str | None = Field(None, max_length=20)
    employee_category: Category | None = None
    employment_type: EmploymentType | None = None
    contract_end_date: date | None = None
    salary_structure_ref: str | None = Field(None, max_length=60)
    hms_username: str | None = Field(None, max_length=120)
    profile: ProfileFields | None = None


class TransferIn(BaseModel):
    effective_from: date
    branch_id: uuid.UUID | None = None
    designation_id: uuid.UUID | None = None
    reporting_manager_id: uuid.UUID | None = None
    departments: list[DepartmentAssignmentIn] = Field(min_length=1, max_length=10)
    reason: str = Field(min_length=3, max_length=1000)

    @model_validator(mode="after")
    def _one_primary(self):
        if sum(1 for d in self.departments if d.is_primary) != 1:
            raise ValueError("exactly one department must be primary")
        return self


class StatusChangeIn(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)
    effective_date: date | None = None


class DepartmentAssignmentOut(ORM):
    id: uuid.UUID
    department_id: uuid.UUID
    department_name: str | None = None
    unit_id: uuid.UUID | None
    is_primary: bool
    allocation_percent: int
    effective_from: date
    effective_to: date | None


class EmploymentRecordOut(ORM):
    id: uuid.UUID
    change_type: str
    effective_from: date
    effective_to: date | None
    employment_type: str
    status: str
    branch_id: uuid.UUID | None
    designation_id: uuid.UUID | None
    reporting_manager_id: uuid.UUID | None
    reason: str | None
    created_by: str | None


class HistoryOut(ORM):
    id: uuid.UUID
    event_type: str
    summary: str
    details: dict | None
    occurred_at: datetime
    created_by: str | None


class AuditOut(ORM):
    id: uuid.UUID
    actor: str
    action: str
    entity_type: str
    changes: dict | None
    created_at: datetime


class EmployeeListItem(BaseModel):
    id: uuid.UUID
    employee_code: str
    full_name: str
    employee_category: str
    employment_type: str
    status: str
    designation: str | None
    department: str | None
    branch: str | None
    phone: str | None
    joining_date: date | None
    biometric_mapped: bool = False


class EmployeeDetail(BaseModel):
    id: uuid.UUID
    employee_code: str
    full_name: str
    first_name: str
    middle_name: str | None
    last_name: str | None
    gender: str | None
    email: str | None
    phone: str | None
    # Personal fields below are None unless the caller may see them.
    date_of_birth: date | None = None
    address_line: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    employee_category: str
    employment_type: str
    status: str
    joining_date: date | None
    exit_date: date | None
    contract_end_date: date | None
    branch_id: uuid.UUID | None
    branch: str | None = None
    designation_id: uuid.UUID | None
    designation: str | None = None
    reporting_manager_id: uuid.UUID | None
    reporting_manager: str | None = None
    salary_structure_ref: str | None = None
    hms_username: str | None
    profile: ProfileFields
    departments: list[DepartmentAssignmentOut]
    contacts: list[ContactOut] = []
    credentials: list[CredentialOut]
    biometric_ids: list[str] = []
    personal_restricted: bool = False
    created_at: datetime
    updated_at: datetime


class ImportResult(BaseModel):
    dry_run: bool
    total_rows: int
    created: int
    errors: list[dict]
