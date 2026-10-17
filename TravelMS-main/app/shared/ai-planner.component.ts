import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, finalize } from 'rxjs';
import { ItineraryItem, Trip } from '../models';
import { ApiService } from '../services/api.service';
import { AiConnection } from '../services/ai-connection.service';
import { PageState } from './ui';
import { IconComponent } from './icon.component';

type DraftItem = ItineraryItem & { selected: boolean; key: number };
@Component({
  selector: 'app-ai-planner',
  imports: [FormsModule, IconComponent],
  templateUrl: './ai-planner.component.html',
})
export class AiPlannerComponent extends PageState implements OnChanges {
  @Input({ required: true }) trip!: Trip;
  @Output() saved = new EventEmitter<void>();
  preferences = '';
  pace = 'balanced';
  expanded = false;
  summary = '';
  draft: DraftItem[] = [];
  action = '';
  feedback = '';
  private contextKey = '';
  private request?: Subscription;
  kinds = [
    { value: 'ACTIVITY', label: 'Activity' },
    { value: 'TRANSPORT', label: 'Transport' },
    { value: 'STAY', label: 'Accommodation' },
    { value: 'NOTE', label: 'Note' },
  ];
  constructor(
    private api: ApiService,
    public connection: AiConnection,
  ) {
    super();
  }
  ngOnChanges() {
    const key = JSON.stringify([
      this.trip.trip_id,
      this.trip.destination,
      this.trip.start_date,
      this.trip.end_date,
      this.trip.status,
      this.trip.estimated_budget,
      this.trip.purpose,
    ]);
    if (key !== this.contextKey) {
      this.request?.unsubscribe();
      this.busy = false;
      this.draft = [];
      this.summary = '';
      this.error = '';
      this.contextKey = key;
    }
  }
  get tooLong() {
    return (Date.parse(this.trip.end_date) - Date.parse(this.trip.start_date)) / 86400000 >= 14;
  }
  get selected() {
    return this.draft.filter((item) => item.selected);
  }
  generate() {
    if (this.busy || !this.connection.available()) return;
    if (!this.preferences.trim()) {
      this.error = 'Describe your interests before generating a plan.';
      return;
    }
    this.action = 'generate';
    this.feedback = '';
    this.request = this.run(
      this.api
        .generateItinerary(this.trip.trip_id!, this.preferences, this.pace)
        .pipe(finalize(() => (this.action = ''))),
      (result) => {
        this.summary = result.summary;
        this.draft = result.items.map((item, key) => ({
          ...item,
          start_time: item.start_time || '',
          key,
          selected: true,
        }));
      },
    );
  }
  save(valid: boolean | null) {
    if (this.busy) return;
    if (!valid || !this.selected.length || this.selected.some((item) => !item.title.trim())) {
      this.error = 'Select at least one item and check its title, date and time.';
      return;
    }
    this.action = 'save';
    const items = this.selected.map(({ selected, key, ...item }) => item);
    this.request = this.run(
      this.api.importItinerary(this.trip.trip_id!, items).pipe(finalize(() => (this.action = ''))),
      (result) => {
        this.feedback =
          `${this.counted(result.added, 'item')} added to your itinerary.` +
          (result.skipped ? ` ${this.counted(result.skipped, 'duplicate')} skipped.` : '');
        this.draft = [];
        this.summary = '';
        this.notices.show(this.feedback);
        this.saved.emit();
      },
    );
  }
  selectAll(selected: boolean) {
    this.draft.forEach((item) => (item.selected = selected));
  }
  discard() {
    this.draft = [];
    this.summary = '';
    this.error = '';
  }
}
