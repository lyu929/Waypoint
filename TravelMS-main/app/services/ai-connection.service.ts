import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class AiConnection {
  available = signal(false);
  checking = signal(true);
  constructor() {
    inject(ApiService)
      .getAiStatus()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (status) => {
          this.available.set(status.available);
          this.checking.set(false);
        },
        error: () => this.checking.set(false),
      });
  }
}
