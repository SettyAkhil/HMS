import uuid
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.employee import EMPLOYEE_CATEGORIES

Code = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
Name = Field(min_length=1, max_length=200)
DepartmentKind = Literal["clinical", "diagnostic", "support", "administrative"]
JobCategory = Literal[EMPLOYEE_CATEGORIES]  # type: ignore[valid-type]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class HospitalIn(BaseModel):
    code: str = Code
    name: str = Name


class HospitalOut(ORM):
    id: uuid.UUID
    code: str
    name: str


class BranchIn(BaseModel):
    hospital_id: uuid.UUID
    code: str = Code
    name: str = Name
    city: str | None = Field(None, max_length=120)
    address: str | None = None


class BranchUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    city: str | None = Field(None, max_length=120)
    address: str | None = None


class BranchOut(ORM):
    id: uuid.UUID
    hospital_id: uuid.UUID
    code: str
    name: str
    city: str | None
    address: str | None


class DepartmentIn(BaseModel):
    code: str = Code
    name: str = Name
    branch_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    kind: DepartmentKind = "clinical"
    head_employee_id: uuid.UUID | None = None
    cost_center: str | None = Field(None, max_length=40)
    annual_budget: Decimal | None = Field(None, ge=0)
    hms_module: Literal["op", "ip", "icu", "er", "ot", "radiology", "laboratory", "pharmacy", "ward", "admin"] | None = None
    census_wards: list[str] | None = Field(None, max_length=30)


class DepartmentUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    branch_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    kind: DepartmentKind | None = None
    head_employee_id: uuid.UUID | None = None
    cost_center: str | None = Field(None, max_length=40)
    annual_budget: Decimal | None = Field(None, ge=0)
    status: Literal["active", "inactive"] | None = None
    hms_module: Literal["op", "ip", "icu", "er", "ot", "radiology", "laboratory", "pharmacy", "ward", "admin"] | None = None
    census_wards: list[str] | None = Field(None, max_length=30)


class DepartmentOut(ORM):
    id: uuid.UUID
    code: str
    name: str
    branch_id: uuid.UUID | None
    parent_id: uuid.UUID | None
    kind: str
    head_employee_id: uuid.UUID | None
    head_name: str | None = None
    cost_center: str | None
    # None unless the caller may see budgets.
    annual_budget: Decimal | None = None
    status: str
    hms_module: str | None = None
    census_wards: list[str] = []
    headcount: int = 0


class UnitIn(BaseModel):
    department_id: uuid.UUID
    code: str = Code
    name: str = Name
    unit_type: str | None = Field(None, max_length=40)
    bed_capacity: int | None = Field(None, ge=0)


class UnitOut(ORM):
    id: uuid.UUID
    department_id: uuid.UUID
    code: str
    name: str
    unit_type: str | None
    bed_capacity: int | None


class DesignationIn(BaseModel):
    code: str = Code
    title: str = Name
    job_category: JobCategory
    grade: str | None = Field(None, max_length=20)
    is_clinical: bool = False
    requires_registration: bool = False


class DesignationUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    job_category: JobCategory | None = None
    grade: str | None = Field(None, max_length=20)
    is_clinical: bool | None = None
    requires_registration: bool | None = None


class DesignationOut(ORM):
    id: uuid.UUID
    code: str
    title: str
    job_category: str
    grade: str | None
    is_clinical: bool
    requires_registration: bool
    headcount: int = 0


class TreeNode(BaseModel):
    id: uuid.UUID
    type: Literal["hospital", "branch", "department", "unit"]
    name: str
    code: str
    headcount: int = 0
    head_name: str | None = None
    children: list["TreeNode"] = []
