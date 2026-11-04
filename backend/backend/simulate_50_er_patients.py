import sys
import os
import random

sys.path.append(os.path.abspath('.'))

from app import app
from utils.database import (
    add_patient, create_er_visit, add_er_vitals, add_er_complaint, 
    set_er_triage, assign_er_doctor, accept_er_doctor_assignment, 
    add_er_clinical_note, add_er_treatment, record_er_disposition, 
    allocate_er_bed_request, create_er_triage_category, list_er_triage_config,
    list_beds, create_bed
)

hospital_id = 1

def run():
    with app.app_context():
        # Setup triage category
        categories = list_er_triage_config(hospital_id, active_only=False)
        b2_cat = next((c for c in categories if c['category_code'] == 'B2'), None)
        if not b2_cat:
            create_er_triage_category(hospital_id, {
                'category_code': 'B2', 'category_label': 'High Priority', 'color': '#ff0000', 'sort_order': 2
            })
            
        print("Starting ER simulation for 50 patients...")
        success_count = 0
        for i in range(1, 51):
            try:
                # 1. Create Patient
                pat_name = f"TestPat {random.randint(10000, 99999)}"
                pat_id = add_patient({'name': pat_name, 'gender': 'Male', 'age': 35}, hospital_id=hospital_id)
                if isinstance(pat_id, dict):
                    pat_id = pat_id.get('patient_id') or pat_id.get('id')
                print(f"Created Patient: {pat_id}")
                
                # 2. Arrival / Visit Creation
                visit = create_er_visit({
                    'patient_id': pat_id,
                    'arrival_mode': 'walk-in',
                    'registered_by': 'simulation'
                }, hospital_id=hospital_id)
                visit_id = visit['id']
                
                # 3. Vitals
                add_er_vitals(hospital_id, visit_id, {
                    'heart_rate': 85, 'bp_systolic': 130, 'bp_diastolic': 85, 'spo2': 97
                }, recorded_by='simulation')
                
                # 4. Complaints
                add_er_complaint(hospital_id, visit_id, {
                    'complaint': 'Severe headache',
                    'severity': 'severe',
                    'reported_by': 'simulation'
                })
                
                # 5. Triage
                set_er_triage(hospital_id, visit_id, {
                    'category': 'B2',
                    'reason': 'Simulated AI triage: High priority.'
                }, assigned_by='simulation')
                
                # 6. Assign Doctor
                assign_er_doctor(hospital_id, visit_id, specialty='Emergency', doctor_name='Dr. Simulation')
                
                # 7. Doctor Accepts
                accept_er_doctor_assignment(hospital_id, visit_id)
                
                # 8. Notes & Treatment
                add_er_clinical_note(hospital_id, visit_id, note_type='assessment', content='Patient stable.', author='Dr. Simulation')
                add_er_treatment(hospital_id, visit_id, {
                    'intervention_type': 'IV Fluids',
                    'administered_by': 'nurse_test'
                })
                
                # 9. Disposition (Ward / ICU)
                outcome = random.choice(['ward', 'icu'])
                disp = record_er_disposition(hospital_id, visit_id, {
                    'outcome': outcome,
                    'clinical_reason': f'Requires {outcome} monitoring.'
                }, decided_by='Dr. Simulation')
                
                # 10. Bed Allocation
                bed_req_id = disp.get('bed_request_id')
                
                if bed_req_id:
                    beds = list_beds(hospital_id)
                    available = [b for b in beds if b['status'] == 'available' and b['ward'].lower() == outcome]
                    if not available:
                        # Create a bed dynamically if none available
                        bed_id = create_bed(hospital_id, outcome, 'Room 1', f'Bed {random.randint(100, 999)}', 'general')
                    else:
                        bed_id = available[0]['id']
                        
                    allocate_er_bed_request(hospital_id, bed_req_id, bed_id, 'Simulated allocation', allocated_by='simulation')
                success_count += 1
            except Exception as e:
                print(f"Error on Patient {i}: {e}")
                
        print(f"Simulation completed. {success_count}/50 patients successfully processed end-to-end.")

if __name__ == '__main__':
    run()
