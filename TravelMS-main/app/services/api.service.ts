import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  User,
  UserInput,
  Trip,
  TripStatus,
  Expense,
  Report,
  ReportStatus,
  TripDetail,
  ItineraryItem,
  AiStatus,
  AiItineraryDraft,
  AiBudgetInsights,
  AiReceiptDraft,
} from '../models';
export type { User, Trip, Expense, Report } from '../models';
@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}
  getUsers() {
    return this.http.get<User[]>('/api/users');
  }
  createUser(user: UserInput) {
    return this.http.post<User>('/api/users', user);
  }
  updateUser(id: number, user: UserInput) {
    return this.http.put('/api/users/' + id, user);
  }
  deleteUser(id: number) {
    return this.http.delete('/api/users/' + id);
  }
  getTrips() {
    return this.http.get<Trip[]>('/api/trips');
  }
  getTrip(id: number) {
    return this.http.get<TripDetail>('/api/trips/' + id);
  }
  getAiStatus() {
    return this.http.get<AiStatus>('/api/ai/status');
  }
  generateItinerary(id: number, preferences: string, pace: string) {
    return this.http.post<AiItineraryDraft>('/api/trips/' + id + '/ai/itinerary', {
      preferences,
      pace,
    });
  }
  importItinerary(id: number, items: ItineraryItem[]) {
    return this.http.post<{ added: number; skipped: number }>(
      '/api/trips/' + id + '/itinerary/import',
      { items },
    );
  }
  getBudgetInsights(id: number) {
    return this.http.post<AiBudgetInsights>('/api/trips/' + id + '/ai/budget', {});
  }
  scanReceipt(id: number) {
    return this.http.post<AiReceiptDraft>('/api/expenses/' + id + '/ai/receipt', {});
  }
  applyReceiptDraft(id: number, draft: AiReceiptDraft) {
    return this.http.post('/api/expenses/' + id + '/ai/receipt/apply', draft);
  }
  createItineraryItem(tripId: number, item: ItineraryItem) {
    return this.http.post('/api/trips/' + tripId + '/itinerary', item);
  }
  updateItineraryItem(tripId: number, itemId: number, item: ItineraryItem) {
    return this.http.put('/api/trips/' + tripId + '/itinerary/' + itemId, item);
  }
  deleteItineraryItem(tripId: number, itemId: number) {
    return this.http.delete('/api/trips/' + tripId + '/itinerary/' + itemId);
  }
  createTrip(trip: Trip) {
    return this.http.post<Trip>('/api/trips', trip);
  }
  updateTrip(id: number, trip: Trip) {
    return this.http.put('/api/trips/' + id, trip);
  }
  updateTripStatus(id: number, status: TripStatus, comment = '') {
    return this.http.patch('/api/trips/' + id + '/status', { status, comment });
  }
  deleteTrip(id: number) {
    return this.http.delete('/api/trips/' + id);
  }
  getExpenses() {
    return this.http.get<Expense[]>('/api/expenses');
  }
  createExpense(expense: Expense) {
    return this.http.post<Expense>('/api/expenses', expense);
  }
  updateExpense(id: number, expense: Expense) {
    return this.http.put('/api/expenses/' + id, expense);
  }
  deleteExpense(id: number) {
    return this.http.delete('/api/expenses/' + id);
  }
  uploadReceipt(id: number, file: File) {
    const data = new FormData();
    data.append('receipt', file);
    return this.http.put('/api/expenses/' + id + '/receipt', data);
  }
  deleteReceipt(id: number) {
    return this.http.delete('/api/expenses/' + id + '/receipt');
  }
  getReports() {
    return this.http.get<Report[]>('/api/reports');
  }
  createReport(trip_id: number) {
    return this.http.post<Report>('/api/reports', { trip_id });
  }
  updateReportStatus(id: number, status: ReportStatus) {
    return this.http.patch('/api/reports/' + id + '/status', { status });
  }
  deleteReport(id: number) {
    return this.http.delete('/api/reports/' + id);
  }
}
