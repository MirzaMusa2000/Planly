@php
    $code = 403;
    $title = 'Not allowed';
    $emoji = '🔒';
    $message = $exception?->getMessage() ?: 'You don’t have permission to do that.';
@endphp
@extends('errors.layout')
