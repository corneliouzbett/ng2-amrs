/* tslint:disable:no-inferrable-types */
import { take } from 'rxjs/operators/take';
import { Component, OnInit, OnDestroy, Input } from '@angular/core';

import { PatientService } from '../../services/patient.service';
import { HivSummaryService } from './hiv-summary.service';
import { Patient } from '../../../models/patient.model';
import { Subscription } from 'rxjs';
import * as Moment from 'moment';
import * as _ from 'lodash';
import { PatientResourceService } from 'src/app/openmrs-api/patient-resource.service';
@Component({
  selector: 'hiv-summary-latest',
  templateUrl: './hiv-summary-latest.component.html',
  styleUrls: ['./hiv-summary.component.css'],
})
export class HivSummaryLatestComponent implements OnInit, OnDestroy {
  @Input() patientUuid: string;
  public loadingHivSummary: boolean = false;
  public hivSummary: any;
  public subscription: Subscription[] = [];
  public patient: Patient;
  public errors: any = [];
  public eligiblePatient: boolean;
  public ineligibiltyReason: string;
  public contraceptionPeriod: string;

  constructor(
    private hivSummaryService: HivSummaryService,
    private patientResourceService: PatientResourceService
  ) {}

  public ngOnInit() {
    this.loadPatient();
    this.loadHivSummary(this.patientUuid);
  }

  public loadPatient() {
    this.patientResourceService.getPatientByUuid(this.patientUuid).subscribe((data: Patient) => {
      this.patient = data;
    }, (err) => {
      this.loadingHivSummary = false;
      this.errors.push({
        id: 'Hiv Summary',
        message:
          'An error occured while loading Hiv Summary. Please try again.',
      });

    });
  }

  public loadHivSummary(patientUuid) {
    const summarySub = this.hivSummaryService
      .getHivSummary(patientUuid, 0, 1, false)
      .subscribe(
        (data) => {
          if (data) {
            for (const summary of data) {
              // check if encounter is clinical
              if (summary.is_clinical_encounter === 1) {
                this.hivSummary = summary;
                const artStartDate = new Date(
                  this.hivSummary.arv_first_regimen_start_date
                ).getFullYear();
                if (
                  isNaN(artStartDate) ||
                  artStartDate === 1899 ||
                  artStartDate === 1900
                ) {
                  this.hivSummary.arv_first_regimen_start_date = null;
                }

                break;
              }
            }

            const lastVlDate: any = this.getLatestVlDate(data);
            if (
              this.endDateIsBeforeStartDate(
                this.hivSummary.vl_1_date,
                lastVlDate
              )
            ) {
              const filtered = _.find(data, (summaryObj: any) => {
                const vlDateMoment = Moment(
                  Moment(summaryObj['vl_1_date']),
                  'DD-MM-YYYY'
                );
                const lastVlDateMoment = Moment(lastVlDate, 'DD-MM-YYYY');
                if (summaryObj['vl_1_date']) {
                  if (vlDateMoment.isSame(lastVlDateMoment)) {
                    return true;
                  } else {
                    return false;
                  }
                }
              });
              //   Replace the lab data with latest lab results that may not be clinical
              this.hivSummary.vl_1_date = filtered.vl_1_date;
              this.hivSummary.vl_1 = filtered.vl_1;
            }
          }
          this.getPatientEligibility(this.hivSummary);
          this.loadingHivSummary = false;
        },
        (err) => {
          this.loadingHivSummary = false;
          this.errors.push({
            id: 'Hiv Summary',
            message:
              'An error occured while loading Hiv Summary. Please try again.',
          });
        }
      );
    this.subscription.push(summarySub);
  }

  public endDateIsBeforeStartDate(startDate: any, endDate: any) {
    return Moment(endDate, 'DD-MM-YYYY').isBefore(
      Moment(startDate, 'DD-MM-YYYY')
    );
  }

  public isEmptyDate(date: any) {
    if (date) {
      return Moment(date).isValid();
    }
    return false;
  }

  public ngOnDestroy() {
    this.subscription.forEach((sub) => {
      sub.unsubscribe();
    });
  }

  private getLatestVlDate(data) {
    const latestVlDate = new Date(
      Math.max.apply(
        null,
        data.map((dataItem) => {
          return new Date(dataItem.vl_1_date);
        })
      )
    );
    return latestVlDate;
  }

  private getPatientEligibility(summary) {
    if (summary) {
      if (this.patient.person.gender === 'M') {
        this.ineligibiltyReason = 'Male Patient';
        this.eligiblePatient = false;
      } else if (
        (this.patient.person.age < 14 || this.patient.person.age > 49) &&
        this.patient.person.gender === 'F'
      ) {
        this.ineligibiltyReason = `Not in reproductive age ${this.patient.person.age}`;
        this.eligiblePatient = false;
      } else if (
        this.patient.person.age >= 14 &&
        this.patient.person.age <= 49 &&
        this.patient.person.gender === 'F' &&
        this.isPostmenopausal(summary.menstruation_status)
      ) {
        this.ineligibiltyReason = 'POSTMENOPAUSAL';
        this.eligiblePatient = false;
      } else if (
        this.patient.person.age >= 14 &&
        this.patient.person.age <= 49 &&
        this.patient.person.gender === 'F'
      ) {
        this.eligiblePatient = true;
      }
    }
  }

  public isPostmenopausal(menstruationStatus: number): boolean {
      // concept 6496  == post-menopausal
      if (menstruationStatus === null || menstruationStatus !== 6496) { return false; }
      if (menstruationStatus === 6496) { return true; }
  }
}
