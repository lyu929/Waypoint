import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { TripDetail, ItineraryItem, TripEvent, Report, ReportStatus } from '../../models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { PageState } from '../../shared/ui';
import { IconComponent } from '../../shared/icon.component';
import { BudgetComponent } from '../../shared/budget.component';
import { TripReviewComponent } from '../../shared/trip-review.component';
import { ReceiptComponent } from '../../shared/receipt.component';
import { AiPlannerComponent } from '../../shared/ai-planner.component';
import { AiBudgetComponent } from '../../shared/ai-budget.component';
@Component({
  selector: 'app-trip-detail',
  imports: [
    FormsModule,
    RouterLink,
    IconComponent,
    BudgetComponent,
    TripReviewComponent,
    ReceiptComponent,
    AiPlannerComponent,
    AiBudgetComponent,
  ],
  templateUrl: './trip-detail.component.html',
})
export class TripDetailComponent extends PageState implements OnInit {
  detail?: TripDetail;
  tabs = ['Overview', 'Itinerary', 'Expenses', 'Reports', 'Activity'];
  tab = 'Overview';
  showForm = false;
  editId: number | null = null;
  item: ItineraryItem = this.emptyItem();
  kinds = [
    { value: 'ACTIVITY', label: 'Activity', icon: 'calendar' },
    { value: 'TRANSPORT', label: 'Transport', icon: 'plane' },
    { value: 'STAY', label: 'Accommodation', icon: 'location' },
    { value: 'NOTE', label: 'Note', icon: 'reports' },
  ];
  private destroyRef = inject(DestroyRef);
  private request?: Subscription;
  constructor(
    private api: ApiService,
    public auth: AuthService,
    private route: ActivatedRoute,
  ) {
    super();
  }
  ngOnInit() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.detail = undefined;
      this.tab = 'Overview';
      this.closeForm();
      this.load();
    });
  }
  get id() {
    return Number(this.route.snapshot.paramMap.get('id'));
  }
  load() {
    this.request?.unsubscribe();
    this.request = this.run(
      this.api.getTrip(this.id),
      (data) => (this.detail = data),
      '',
      !this.detail,
    );
  }
  get itineraryEditable() {
    return !!this.detail && !['COMPLETED', 'CANCELLED'].includes(this.detail.trip.status);
  }
  get expenseEligible() {
    return !!this.detail && ['APPROVED', 'COMPLETED'].includes(this.detail.trip.status);
  }
  get latestReview() {
    const history = this.detail?.history || [];
    return history.find((event) => event.event_type === 'STATUS_CHANGED') || history[0];
  }
  get days() {
    const groups = new Map<string, ItineraryItem[]>();
    for (const item of this.detail?.itinerary || []) {
      if (!groups.has(item.item_date)) groups.set(item.item_date, []);
      groups.get(item.item_date)!.push(item);
    }
    return Array.from(groups, ([date, items]) => ({ date, items }));
  }
  emptyItem(): ItineraryItem {
    return { item_date: '', start_time: '', kind: 'ACTIVITY', title: '', location: '', notes: '' };
  }
  openItem(item?: ItineraryItem) {
    this.editId = item?.item_id || null;
    this.item = item
      ? { ...item, start_time: item.start_time || '' }
      : { ...this.emptyItem(), item_date: this.detail!.trip.start_date };
    this.tab = 'Itinerary';
    this.showForm = true;
    this.error = '';
  }
  closeForm() {
    this.showForm = false;
    this.editId = null;
  }
  saveItem(valid: boolean | null) {
    if (!valid || !this.item.title.trim()) {
      this.error = 'Enter a title and a date within your trip.';
      return;
    }
    const request = this.editId
      ? this.api.updateItineraryItem(this.id, this.editId, this.item)
      : this.api.createItineraryItem(this.id, this.item);
    this.run(
      request,
      () => {
        this.closeForm();
        this.load();
      },
      'Itinerary saved. Your day is taking shape.',
    );
  }
  deleteItem(item: ItineraryItem) {
    if (confirm('Delete this itinerary item?'))
      this.run(
        this.api.deleteItineraryItem(this.id, item.item_id!),
        () => this.load(),
        'Itinerary item deleted.',
      );
  }
  kindLabel(value: string) {
    return this.kinds.find((k) => k.value === value)?.label || value;
  }
  kindIcon(value: string) {
    return this.kinds.find((k) => k.value === value)?.icon || 'calendar';
  }
  eventLabel(event: TripEvent) {
    if (event.event_type === 'STATUS_CHANGED')
      return (
        (
          {
            APPROVED: 'Approved the trip',
            REJECTED: 'Requested a revision',
            COMPLETED: 'Completed the trip',
            PLANNED: 'Resubmitted for approval',
          } as Record<string, string>
        )[event.to_status!] || 'Changed the trip status'
      );
    return (
      (
        {
          CREATED: 'Submitted the trip',
          UPDATED: 'Updated trip details',
          RESUBMITTED: 'Updated and resubmitted the trip',
          ITINERARY_CREATED: 'Added an itinerary item',
          ITINERARY_UPDATED: 'Updated an itinerary item',
          ITINERARY_DELETED: 'Removed an itinerary item',
          AI_ITINERARY_IMPORTED: 'Added reviewed AI itinerary items',
          AI_RECEIPT_APPLIED: 'Applied reviewed receipt details',
        } as Record<string, string>
      )[event.event_type] || event.event_type
    );
  }
  eventTime(value: string) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value.replace(' ', 'T') + 'Z'));
  }
  tabKey(event: KeyboardEvent, index: number) {
    let target = index;
    if (event.key === 'ArrowRight') target = (index + 1) % this.tabs.length;
    else if (event.key === 'ArrowLeft') target = (index + this.tabs.length - 1) % this.tabs.length;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = this.tabs.length - 1;
    else return;
    event.preventDefault();
    this.tab = this.tabs[target];
    document.getElementById('trip-tab-' + target)?.focus();
  }
  generateReport() {
    this.run(
      this.api.createReport(this.id),
      () => this.load(),
      'Report created from the current expenses.',
    );
  }
  reviewReport(report: Report, status: ReportStatus) {
    this.run(
      this.api.updateReportStatus(report.report_id, status),
      () => this.load(),
      'Report status updated.',
    );
  }
}
