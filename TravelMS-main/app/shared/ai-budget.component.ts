import { Component, Input, OnChanges } from '@angular/core';
import { Subscription } from 'rxjs';
import { AiBudgetInsights, Trip } from '../models';
import { ApiService } from '../services/api.service';
import { AiConnection } from '../services/ai-connection.service';
import { PageState } from './ui';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-ai-budget',
  imports: [IconComponent],
  template: `<section class="ai-panel panel" aria-labelledby="ai-budget-title">
    <div class="ai-heading">
      <span class="ai-symbol"><app-icon name="expenses" /></span>
      <div>
        <div class="eyebrow">SEE THE BIGGER PICTURE</div>
        <h2 id="ai-budget-title">Budget Insights</h2>
        <p>A little perspective on your recorded spending.</p>
      </div>
      <button
        class="secondary"
        type="button"
        (click)="generate()"
        [disabled]="busy || !connection.available()"
      >
        {{ busy ? 'Reading your budget…' : insights ? 'Refresh insights' : 'Explain my budget' }}
      </button>
    </div>
    @if (!connection.checking() && !connection.available()) {
      <p class="ai-note">
        AI is not connected yet. Your budget totals and alerts remain available.
      </p>
    }
    <p class="ai-disclosure">
      Generating sends this trip's details, budget and category totals to OpenAI. Amounts are
      calculated from your saved expenses.
    </p>
    @if (error) {
      <p class="error" role="alert">{{ error }}</p>
    }
    @if (insights; as result) {
      <div class="ai-insights" aria-live="polite">
        <div class="ai-budget-facts">
          <div>
            <span>Allocated</span><strong>{{ money(result.snapshot.budget_usd) }}</strong>
          </div>
          <div>
            <span>Recorded</span><strong>{{ money(result.snapshot.spent) }}</strong>
          </div>
          <div>
            <span>{{ result.snapshot.remaining < 0 ? 'Over budget' : 'Remaining' }}</span
            ><strong>{{
              money(
                result.snapshot.remaining < 0 ? result.snapshot.overrun : result.snapshot.remaining
              )
            }}</strong>
          </div>
        </div>
        <p>{{ result.summary }}</p>
        <ul>
          @for (suggestion of result.suggestions; track $index) {
            <li>{{ suggestion }}</li>
          }
        </ul>
        <small class="field-hint"
          >Based on {{ counted(result.snapshot.expense_count, 'saved expense') }} at the time of
          generation. Refresh after making changes.</small
        >
      </div>
    }
  </section>`,
})
export class AiBudgetComponent extends PageState implements OnChanges {
  @Input({ required: true }) trip!: Trip;
  insights?: AiBudgetInsights;
  private context = '';
  private request?: Subscription;
  constructor(
    private api: ApiService,
    public connection: AiConnection,
  ) {
    super();
  }
  ngOnChanges() {
    const context = JSON.stringify(this.trip);
    if (context !== this.context) {
      this.request?.unsubscribe();
      this.insights = undefined;
      this.error = '';
      this.busy = false;
      this.context = context;
    }
  }
  generate() {
    if (this.busy || !this.connection.available()) return;
    this.request = this.run(
      this.api.getBudgetInsights(this.trip.trip_id!),
      (result) => (this.insights = result),
    );
  }
}
