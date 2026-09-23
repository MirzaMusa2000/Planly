@php
    $code = 419;
    $title = 'Session expired';
    $emoji = '⏰';
    $message = 'This page was open for a while, so your session expired. Please sign in again.';
    $actionUrl = url('/login');
    $actionLabel = 'Sign in again';
@endphp
@extends('errors.layout')
